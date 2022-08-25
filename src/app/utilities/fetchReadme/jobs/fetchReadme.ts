import { CronJob } from 'cron'
import { GetAssetsWithoutReadme } from '../models/GET/GetAssetsWithoutReadme'
import { FetchReadme } from '../services/FetchReadme'

export const fetchReadmeCron = new CronJob('0 1 * * *', () => {
  void fetchReadme()
})

async function fetchReadme (): Promise<void> {
  const assets = await GetAssetsWithoutReadme()

  for (const asset of assets) {
    await FetchReadme(asset.asset_id, asset.download_url)
  }
}
