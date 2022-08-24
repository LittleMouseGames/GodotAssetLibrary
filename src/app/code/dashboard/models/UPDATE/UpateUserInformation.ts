import { MongoHelper } from 'core/MongoHelper'

/**
 * Update users email and or password given a hashed token
 *
 * @param {string} token
 * @param {string} username
 * @param {string} email
 * @returns
 */
export async function UpdateUserInformtaion (token: string, username: string, email: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': token
  }, {
    $set: {
      username: username,
      username_lowercase: username.toLocaleLowerCase(),
      email: email
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update user information')
  }

  return operationObject
}
