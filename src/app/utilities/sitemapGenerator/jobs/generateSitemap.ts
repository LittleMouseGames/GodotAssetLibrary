import { CronJob } from 'cron'
import { GetAllCategoriesAndTheirAssetCount } from 'app/code/homepage/models/GET/GetAllCategoriesAndTheirAssetCount'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { createWriteStream } from 'fs'
import { rename } from 'fs/promises'
import { pipeline as streamPipeline } from 'stream/promises'
import { SitemapStream } from 'sitemap'
import path from 'path'

let generating = false

// eslint-disable-next-line @typescript-eslint/no-misused-promises
export const generateSitemapCron = new CronJob('0 2 * * *', () => {
  void runGenerateSitemap()
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
  const pipePromise = streamPipeline(sitemap, writeStream)

  const cursor = mongo.collection('assets').find({}, {
    projection: { asset_id: 1, title: 1, modify_date: 1 }
  })

  for await (const asset of cursor) {
    const ok = sitemap.write({
      url: `/asset/${asset.asset_id}/${encodeURI(String(asset.title).replace(/\s/g, '-')).toLocaleLowerCase()}`,
      changefreq: 'monthly',
      lastmod: asset.modify_date
    })
    if (!ok) {
      await new Promise<void>(resolve => sitemap.once('drain', resolve))
    }
  }

  for (const [key] of Object.entries(categories)) {
    sitemap.write({ url: `/category/${key.toLocaleLowerCase()}`, changefreq: 'weekly' })
  }

  sitemap.end()
  await pipePromise
  await rename(tmpPath, finalPath)
}
