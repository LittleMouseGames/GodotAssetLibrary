import { MongoHelper } from 'MongoHelper'

export async function GetHasUserReviewedAsset (hashedToken: string, assetId: String): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': hashedToken,
    reviewed_posts: assetId
  }, {
    projection: {
      reviewd_posts: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}
