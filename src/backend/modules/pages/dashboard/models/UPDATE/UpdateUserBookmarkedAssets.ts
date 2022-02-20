import { MongoHelper } from 'MongoHelper'

/**
 * Add asset ID to users bookmarked_assets list
 *
 * @param {string} hashedToken
 * @param {string} assetId
 */
export async function UpdateUserBookmarkedAssets (hashedToken: string, assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': hashedToken
  }, {
    $push: {
      bookmarked_assets: assetId
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update user')
  }
}
