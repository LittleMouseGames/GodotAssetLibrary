import { CronJob } from 'cron'
import { logger } from 'utility/logger'

export const hello = new CronJob('0 */1 * * * *', function () {
  logger.log('info', 'You will see this message every minute')
})
