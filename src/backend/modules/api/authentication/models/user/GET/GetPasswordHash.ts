import { MongoHelper } from 'MongoHelper'

/**
 * Retrieves password hash for login by password
 *
 * @param {string} username username
 * @returns {Promise<string>}
 * @throws {error}
 */
export async function GetPasswordHash (username: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    username_lowercase: username.toLocaleLowerCase()
  }, {
    projection: {
      password_hash: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.password_hash
}
