import { MongoHelper } from 'MongoHelper'

export async function UpdateUserReviewedAssets (hashedToken: string, assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': hashedToken
  }, {
    $push: {
      reviewd_assets: assetId
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update user')
  }
}
