import { MongoHelper } from 'core/MongoHelper'

interface UserWithResumeTokens {
  resume_tokens: Array<{ expires: Date }>
}

/**
 * Deletes resume tokens that are expired
 */
export async function DeleteExpiredResumeTokens (): Promise<void> {
  const mongo = MongoHelper.getDatabase()

  await mongo.collection<UserWithResumeTokens>('users').updateMany({
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
