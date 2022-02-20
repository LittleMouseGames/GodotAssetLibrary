import { MongoHelper } from 'MongoHelper'

/**
 * Get user human_id given hashed token
 *
 * @param {string} token hashed token
 * @returns {Promise<string>}
 */
export async function GetUserIdByToken (token: string): Promise<string> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      human_id: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.human_id
}
