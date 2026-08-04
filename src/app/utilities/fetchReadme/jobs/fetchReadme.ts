import { CronJob } from 'cron'
import { logger } from 'core/utils/logger'
import { GetAssetsWithoutReadme } from '../models/GET/GetAssetsWithoutReadme'
import { FetchReadme } from '../services/FetchReadme'

let running = false

export const fetchReadmeCron = new CronJob('1 */6 * * *', () => {
  void runFetchReadme()
})

export async function runFetchReadme (): Promise<void> {
  if (running) {
    logger.log('warn', 'Skipping README fetch because the previous run is still active')
    return
  }

  running = true
  try {
    const assets = await GetAssetsWithoutReadme()

    for (const asset of assets) {
      await FetchReadme(asset.asset_id, asset.download_url)
    }
  } finally {
    running = false
  }
}
