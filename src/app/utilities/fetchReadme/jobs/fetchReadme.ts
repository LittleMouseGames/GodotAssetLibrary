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
    const cursor = GetAssetsWithoutReadme()
    let processed = 0
    for await (const asset of cursor) {
      await FetchReadme(asset.asset_id, asset.download_url)
      processed++
    }
    logger.log('info', `README fetch complete, processed ${processed} assets`)
  } finally {
    running = false
  }
}
