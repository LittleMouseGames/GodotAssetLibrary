import { MongoHelper } from 'MongoHelper'

/**
 * Add asset ID to users reviewed_asset list
 *
 * @param {string} hashedToken
 * @param {string} assetId
 */
export async function UpdateUserReviewedAssets (hashedToken: string, assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': hashedToken
  }, {
    $push: {
      reviewed_assets: assetId
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update user')
  }
}
