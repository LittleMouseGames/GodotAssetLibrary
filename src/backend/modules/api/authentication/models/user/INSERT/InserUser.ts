import { MongoHelper } from 'MongoHelper'
import { customAlphabet } from 'nanoid/non-secure'

/**
 * Insert user into Database
 *
 * A service contract to insert a user
 * into our database
 *
 * @param {string} username
 * @param {string} email
 * @param {string} passwordHash
 * @param {string} token
 * @param {string} tokenExpires
 * @returns
 */
export async function InsertUser (username: string, email: string, passwordHash: string, token: string, tokenExpires: Date): Promise<any> {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 36)
  const mongo = MongoHelper.getDatabase()
  const userObj = await mongo.collection('users').insertOne({
    human_id: nanoid(),
    username: username,
    email: email,
    password_hash: passwordHash,
    username_lowercase: username.toLocaleLowerCase(),
    reviewed_assets: [],
    saved_assets: [],
    role: 'user',
    resume_tokens: [
      {
        token: token,
        expires: tokenExpires
      }
    ]
  })

  return userObj
}
