import { CronJob } from 'cron'
import { logger } from 'utility/logger'

export const hello = new CronJob('0 */1 * * * *', function () {
  logger.log('info', 'You will see this message every minute')
})

export const deleteExpiredTokens = new CronJob('0 0 0 */1 * *', function () {
  logger.log('info', 'Removing expired tokens')
  // TODO
})
