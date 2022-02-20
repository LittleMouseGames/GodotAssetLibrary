import { MongoHelper } from 'MongoHelper'

/**
 * Checks if a user exists given a hashed token
 *
 * @param {string} token hashed resume token
 * @returns {Promise<boolean>}
 */
export async function GetDoesUserExistByToken (token: string): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      human_id: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}
