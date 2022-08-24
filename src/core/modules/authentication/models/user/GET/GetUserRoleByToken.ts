import { MongoHelper } from 'core/MongoHelper'

/**
 * Get user human_id given hashed token
 *
 * @param {string} token hashed token
 * @returns {Promise<string>}
 * @throws {error} if user not found
 */
export async function GetUserRoleByToken (token: string): Promise<string> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      role: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.role
}
