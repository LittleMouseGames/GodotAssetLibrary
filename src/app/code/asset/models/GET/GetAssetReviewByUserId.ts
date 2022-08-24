import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { reviews } from 'core/modules/authentication/schema/reviews'

interface ReturnedReview extends WithId<Document>, reviews {}

/**
 * Get asset review for user
 *
 * @param {string} assetId
 * @param {string} userId
 * @returns {ReturnedReview}
 */
export async function GetAssetReviewByUserId (assetId: string, userId: string): Promise<ReturnedReview> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reviews').findOne({ asset_id: assetId, user_id: userId }) as ReturnedReview

  return operationObject
}
