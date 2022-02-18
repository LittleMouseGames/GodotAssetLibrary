import { MongoHelper } from 'MongoHelper'

export async function UpdateCommentForAsset (userId: string, assetId: string, reviewType: string, reviewText: string, reviewHeadline: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('comments').updateOne({
    user_id: userId,
    asset_id: assetId
  }, {
    $set: {
      review_type: reviewType,
      text: reviewText,
      headline: reviewHeadline,
      modified_date: new Date()
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update comment')
  }

  return operationObject
}
