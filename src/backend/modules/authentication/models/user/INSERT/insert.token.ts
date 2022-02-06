import { MongoHelper } from 'MongoHelper'
import { Db } from 'mongodb'

export async function InsertToken (username: string, token: string, tokenExpires: Date): Promise<any> {
  const mongo: Db = MongoHelper.getDatabase()
  const userObj = await mongo.collection('users').updateOne({ username: username }, {
    $push: {
      resumeTokens: {
        token: token,
        expires: tokenExpires
      }
    }
  })

  return userObj
}
