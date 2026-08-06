import { CronJob } from 'cron'
import { GetAllCategoriesAndTheirAssetCount } from 'app/code/homepage/models/GET/GetAllCategoriesAndTheirAssetCount'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { createWriteStream } from 'fs'
import { rename, unlink } from 'fs/promises'
import { pipeline as streamPipeline } from 'stream/promises'
import { SitemapStream } from 'sitemap'
import path from 'path'

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
  const categories = await GetAllCategoriesAndTheirAssetCount()

  const tmpPath = path.join(__dirname, '../dist/public/sitemap.xml.tmp')
  const finalPath = path.join(__dirname, '../dist/public/sitemap.xml')
  const sitemap = new SitemapStream({ hostname: 'http://godotassetlibrary.com' })
  const writeStream = createWriteStream(tmpPath)
  let pipelineError = ''
  const pipePromise = streamPipeline(sitemap, writeStream).catch((error: Error) => {
    pipelineError = error.message
  })

  const cursor = mongo.collection('assets').find({}, {
    projection: { asset_id: 1, title: 1, modify_date: 1 }
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
    for await (const asset of cursor) {
      await writeEntry({
        url: `/asset/${asset.asset_id}/${encodeURI(String(asset.title).replace(/\s/g, '-')).toLocaleLowerCase()}`,
        changefreq: 'monthly',
        lastmod: asset.modify_date
      })
    }

    for (const [key] of Object.entries(categories)) {
      await writeEntry({ url: `/category/${key.toLocaleLowerCase()}`, changefreq: 'weekly' })
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
