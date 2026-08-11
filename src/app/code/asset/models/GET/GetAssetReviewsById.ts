import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { reviews } from 'app/utilities/fetchFromGodot/schema/reviews'

interface ReturnedReviews extends WithId<Document>, reviews {}

/**
 * Get reviews for asset, newest first, deterministically ordered and bounded
 * to a page of results.
 *
 * @param {string} assetId
 * @param {number} limit max reviews to return
 * @param {number} skip how many newest reviews to skip
 * @returns {ReturnedReviews}
 */
export async function GetAssetReviewsById (
  assetId: String,
  limit: number = 10,
  skip: number = 0
): Promise<ReturnedReviews[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reviews')
    .find({ asset_id: assetId })
    .sort({ date: -1, _id: -1 })
    .limit(limit)
    .skip(skip)
    .toArray() as ReturnedReviews[]

  return operationObject
}
