import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'

/**
 * Deletes resume tokens that are expired
 */
export async function DeleteExpiredResumeTokens (): Promise<any> {
  const mongo = MongoHelper.getDatabase()

  mongo.collection('users').updateMany({
    'resume_tokens.expires': {
      $lte: new Date()
    }
  }, {
    $pull: {
      'resume_tokens.expires': {
        expires: {
          $lte: new Date()
        }
      }
    }
  }).catch(e => {
    logger.log('error', 'Error pulling resume token', [...e])
  })
}
