import { CronJob } from 'cron'
import { logger } from 'core/utils/logger'
import { DeleteExpiredResumeTokens } from '../../models/user/DELETE/DeleteExpiredResumeTokens'

/**
 * Check resume tokens everyday and remove expired
 */
export const deleteExpiredTokens = new CronJob('0 0 0 */1 * *', function () {
  logger.log('info', 'Removing expired tokens')
  DeleteExpiredResumeTokens().then(() => {
    logger.log('info', 'Expired resume tokens removed')
  }).catch(e => {
    logger.log('error', 'Error removing expired token', ...[e])
  })
})
