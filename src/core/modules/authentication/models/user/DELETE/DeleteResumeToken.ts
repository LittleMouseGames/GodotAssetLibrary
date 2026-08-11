import { MongoHelper } from 'core/MongoHelper'
import { Db } from 'mongodb'

/**
 * Revoke a single resume token (e.g. on logout) by removing it from the
 * user's resume_tokens array. This makes the current session invalid even if
 * the cookie is later replayed.
 */
export async function DeleteResumeToken (hashedToken: string): Promise<void> {
  const mongo: Db = MongoHelper.getDatabase()
  await mongo.collection('users').updateOne(
    { 'resume_tokens.token': hashedToken },
    { $pull: { resume_tokens: { token: hashedToken } } }
  )
}
