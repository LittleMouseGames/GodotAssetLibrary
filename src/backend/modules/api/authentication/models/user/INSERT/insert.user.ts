import { MongoHelper } from 'MongoHelper'
import { customAlphabet } from 'nanoid/non-secure'

/**
 * Insert user into Database
 *
 * A service contract to insert a user
 * into our database
 *
 * @param {String} username the username
 * @param {String} passwordHash the hashed password
 * @param {String} token the hashed token
 * @param {Date} tokenExpires when the token expires
 */
export async function InsertUser (username: string, passwordHash: string, token: string, tokenExpires: Date): Promise<any> {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 36)
  const mongo = MongoHelper.getDatabase()
  const userObj = await mongo.collection('users').insertOne({
    humanId: nanoid(),
    username: username,
    password: passwordHash,
    usernameLower: username.toLocaleLowerCase(),
    resumeTokens: [
      {
        token: token,
        expires: tokenExpires
      }
    ]
  })

  return userObj
}
