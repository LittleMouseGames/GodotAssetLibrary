import { MongoHelper } from 'MongoHelper'

/**
 * Update password hash for user given a token
 *
 * @param {string} token
 * @param {string} passwordHash
 * @returns
 */
export async function UpdatePasswordHashByToken (token: string, passwordHash: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': token
  }, {
    $set: {
      password_hash: passwordHash
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject
}
