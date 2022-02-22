import { CronJob } from 'cron'
import { GetAllCategoriesAndTheirAssetCount } from 'modules/pages/homepage/models/GET/GetAllCategoriesAndTheirAssetCount'
import { GetAssetsWithoutQuery } from 'modules/pages/search/models/GET/GetAssetsWithoutQuery'
import { logger } from 'utility/logger'
import { createWriteStream } from 'fs'
import { SitemapStream } from 'sitemap'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-misused-promises
export const generateSitemapCron = new CronJob('0 1 * * *', () => {
  logger.log('info', 'Generating sitemap')
  void generateSitemap()
})

async function generateSitemap (): Promise<void> {
  const categories = await GetAllCategoriesAndTheirAssetCount()
  const assets = await GetAssetsWithoutQuery(0, 0)

  const sitemap = new SitemapStream({ hostname: 'http://godotassetlibrary.com' })
  const writeStream = createWriteStream(path.join(__dirname, '../dist/public/sitemap.xml'))

  sitemap.pipe(writeStream)

  assets.forEach(asset => {
    sitemap.write({ url: `/asset/${asset.asset_id}/${encodeURI(asset.title.replace(/\s/g, '-')).toLocaleLowerCase()}`, changefreq: 'monthly', lastmod: asset.modify_date })
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [key, value] of Object.entries(categories)) {
    sitemap.write({ url: `/search/?q=&category=${key.toLocaleLowerCase()}`, changefreq: 'weekly' })
  }

  sitemap.end()
}
