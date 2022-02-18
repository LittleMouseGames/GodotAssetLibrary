import { MongoHelper } from 'MongoHelper'

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
