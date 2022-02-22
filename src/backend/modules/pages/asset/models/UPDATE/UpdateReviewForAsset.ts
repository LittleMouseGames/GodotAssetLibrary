import { MongoHelper } from 'MongoHelper'

/**
 *  Update comment for asset given user ID and asset ID
 *
 * @param {string} userId
 * @param {string} assetId
 * @param {string} reviewType
 * @param {string} reviewText
 * @param {string} reviewHeadline
 * @returns
 */
export async function UpdateReviewForAsset (userId: string, assetId: string, reviewType: string, reviewText: string, reviewHeadline: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reviews').updateOne({
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
