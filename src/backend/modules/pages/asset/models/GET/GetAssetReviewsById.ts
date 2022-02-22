import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { reviews } from 'utility/schema/reviews'

interface ReturnedReviews extends WithId<Document>, reviews {}

/**
 * Get all reviews for asset
 *
 * @param {string} assetId
 * @returns {ReturnedReviews}
 */
export async function GetAssetReviewsById (assetId: String): Promise<ReturnedReviews[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reviews').find({ asset_id: assetId }).limit(10).toArray() as ReturnedReviews[]

  return operationObject
}
