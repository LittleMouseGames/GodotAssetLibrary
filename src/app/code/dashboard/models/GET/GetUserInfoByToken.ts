import { MongoHelper } from 'core/MongoHelper'

/**
 * Get email and username
 *
 * @param {string} token
 * @returns
 */
export async function GetUserInfoByToken (token: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      username: 1,
      email: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject
}
