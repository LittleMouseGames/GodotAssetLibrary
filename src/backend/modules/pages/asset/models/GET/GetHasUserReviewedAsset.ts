import { MongoHelper } from 'MongoHelper'

export async function GetHasUserReviewedAsset (hashedToken: string, assetId: String): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': hashedToken,
    reviewd_assets: assetId
  }, {
    projection: {
      reviewd_assets: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}
