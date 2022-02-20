import { MongoHelper } from 'MongoHelper'

/**
 * Get all bookmarked asset list from user
 *
 * @param {string} token
 * @returns {[string]}
 */
export async function GetUserBookmarkedAssets (token: string): Promise<[string]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      _id: 0,
      bookmarked_assets: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.bookmarked_assets
}
