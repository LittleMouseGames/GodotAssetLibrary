import { CronJob } from 'cron'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { createWriteStream } from 'fs'
import { rename, unlink } from 'fs/promises'
import { pipeline as streamPipeline } from 'stream/promises'
import { SitemapStream } from 'sitemap'
import path from 'path'
import { buildAssetUrl } from 'core/utils/assetUrl'
import { buildCategoryPath, buildEnginePath } from 'core/utils/taxonomyUrl'
import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'
import { GetPublicCategoryCounts, GetPublicEngineCounts } from '../models/GET/GetPublicTaxonomyCounts'
import { getAllGuides } from 'app/code/guides/models/guide'

let generating = false

// eslint-disable-next-line @typescript-eslint/no-misused-promises
export const generateSitemapCron = new CronJob('0 2 * * *', () => {
  void runGenerateSitemap().catch((error: any) => {
    logger.log('error', `Sitemap generation failed: ${error?.message ?? error}`)
  })
})

export async function runGenerateSitemap (): Promise<void> {
  if (generating) {
    logger.log('warn', 'Skipping sitemap generation because the previous run is still active')
    return
  }

  generating = true
  try {
    logger.log('info', 'Generating sitemap')
    await generateSitemap()
  } finally {
    generating = false
  }
}

async function generateSitemap (): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const [categories, engines] = await Promise.all([
    GetPublicCategoryCounts(),
    GetPublicEngineCounts()
  ])

  const tmpPath = path.join(__dirname, '../dist/public/sitemap.xml.tmp')
  const finalPath = path.join(__dirname, '../dist/public/sitemap.xml')
  const sitemap = new SitemapStream({ hostname: 'https://godotassetlibrary.com' })
  const writeStream = createWriteStream(tmpPath)
  let pipelineError = ''
  const pipePromise = streamPipeline(sitemap, writeStream).catch((error: Error) => {
    pipelineError = error.message
  })

  // Exclude assets that are no longer available upstream or were marked
  // non-searchable, so crawlers don't index stale/tombstoned pages.
  const cursor = mongo.collection('assets').find(PUBLIC_ASSET_FILTER, {
    projection: { asset_id: 1, title: 1, modify_date: 1, modify_date_at: 1 }
  })

  let completed = false
  const writeEntry = async (entry: object): Promise<void> => {
    if (pipelineError !== '') {
      throw new Error(pipelineError)
    }
    if (sitemap.write(entry)) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const onDrain = (): void => {
        cleanup()
        resolve()
      }
      const onError = (error: Error): void => {
        cleanup()
        reject(error)
      }
      const cleanup = (): void => {
        sitemap.off('drain', onDrain)
        sitemap.off('error', onError)
      }
      sitemap.once('drain', onDrain)
      sitemap.once('error', onError)
    })
  }

  try {
    // Core pages and editorial content.
    await writeEntry({ url: '/', changefreq: 'daily', priority: 1 })
    await writeEntry({ url: '/search/', changefreq: 'daily', priority: 0.8 })
    await writeEntry({ url: '/guides', changefreq: 'weekly', priority: 0.9 })
    for (const guide of getAllGuides()) {
      await writeEntry({ url: guide.url, changefreq: 'monthly', priority: 0.9 })
    }

    for await (const asset of cursor) {
      const lastmod = asset.modify_date_at ?? asset.modify_date
      await writeEntry({
        url: buildAssetUrl(asset.asset_id, asset.title),
        changefreq: 'monthly',
        lastmod
      })
    }

    for (const { key } of categories) {
      if (key === '') continue
      await writeEntry({ url: buildCategoryPath(key), changefreq: 'weekly', priority: 0.7 })
    }

    for (const { key } of engines) {
      if (key === '') continue
      await writeEntry({ url: buildEnginePath(key), changefreq: 'weekly', priority: 0.6 })
    }

    for (const legal of [
      '/terms/privacy-policy',
      '/terms/terms-of-service',
      '/terms/cookie-policy',
      '/terms/acceptable-use-policy'
    ]) {
      await writeEntry({ url: legal, changefreq: 'yearly', priority: 0.2 })
    }

    sitemap.end()
    await pipePromise
    if (pipelineError !== '') {
      throw new Error(pipelineError)
    }
    await rename(tmpPath, finalPath)
    completed = true
  } finally {
    await cursor.close()
    if (!sitemap.destroyed) {
      sitemap.destroy()
    }
    if (!writeStream.destroyed) {
      writeStream.destroy()
    }
    if (!completed) {
      await unlink(tmpPath).catch(() => {})
    }
  }
}
