import { MongoHelper } from 'core/MongoHelper'

interface UserContext {
  loggedIn: boolean
  role?: string
}

/** Fetch login state and role with one indexed query while rejecting expired tokens. */
export async function GetUserContextByToken (token: string): Promise<UserContext> {
  const mongo = MongoHelper.getDatabase()
  const user = await mongo.collection('users').findOne({
    resume_tokens: {
      $elemMatch: {
        token,
        expires: { $gt: new Date() }
      }
    }
  }, {
    projection: { role: 1 }
  })

  return user === null
    ? { loggedIn: false }
    : { loggedIn: true, role: user.role as string | undefined }
}
