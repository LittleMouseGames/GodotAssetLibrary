import { MongoHelper } from 'MongoHelper'

/**
 *  Check if user has reviewed an asset given token and asset ID
 *
 * @param {string} hashedToken
 * @param {string} assetId
 * @returns
 */
export async function GetHasUserReviewedAsset (hashedToken: string, assetId: String): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': hashedToken,
    reviewed_assets: assetId
  }, {
    projection: {
      reviewed_assets: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}
