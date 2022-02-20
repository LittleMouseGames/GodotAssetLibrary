import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { comments } from 'utility/schema/comments'

interface ReturnedReviews extends WithId<Document>, comments {}

/**
 * Get all reviews for asset
 *
 * @param {string} assetId
 * @returns {ReturnedReviews}
 */
export async function GetAssetReviewsById (assetId: String): Promise<ReturnedReviews[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('comments').find({ asset_id: assetId }).toArray() as ReturnedReviews[]

  return operationObject
}
