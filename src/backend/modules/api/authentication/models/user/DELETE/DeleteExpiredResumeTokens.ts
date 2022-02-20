import { MongoHelper } from 'MongoHelper'

/**
 * Deletes resume tokens that are expired
 */
export async function DeleteExpiredResumeTokens (): Promise<any> {
  const mongo = MongoHelper.getDatabase()

  await mongo.collection('users').updateMany({
    'resume_tokens.expires': {
      $lte: new Date()
    }
  }, {
    $pull: {
      resume_tokens: {
        expires: {
          $lte: new Date()
        }
      }
    }
  })
}
