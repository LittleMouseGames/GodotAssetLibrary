import { MongoHelper } from 'MongoHelper'
import { Db } from 'mongodb'

/**
 *  Insert resume token into user object
 *
 * @param {string} username username
 * @param {string} token hashed token
 * @param {string} tokenExpires token expiry date
 * @returns
 */
export async function InsertToken (username: string, token: string, tokenExpires: Date): Promise<any> {
  const mongo: Db = MongoHelper.getDatabase()
  const userObj = await mongo.collection('users').updateOne({ username: username }, {
    $push: {
      resume_tokens: {
        token: token,
        expires: tokenExpires
      }
    }
  })

  return userObj
}
