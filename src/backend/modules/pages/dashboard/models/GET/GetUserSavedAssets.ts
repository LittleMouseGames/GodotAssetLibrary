import { MongoHelper } from 'MongoHelper'

/**
 * Get all saved asset list from user
 *
 * @param {string} token
 * @returns {[string]}
 */
export async function GetUserSavedAssets (token: string): Promise<[string]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      _id: 0,
      saved_assets: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.saved_assets
}
