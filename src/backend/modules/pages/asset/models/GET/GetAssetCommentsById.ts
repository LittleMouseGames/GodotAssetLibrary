import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { comments } from 'utility/schema/comments'

interface ReturnedComments extends WithId<Document>, comments {}

/**
 * Get all reviews for asset
 *
 * @param {string} assetId
 * @returns {ReturnedComments}
 */
export async function GetAssetCommentsById (assetId: String): Promise<ReturnedComments[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('comments').find({ asset_id: assetId }).toArray() as ReturnedComments[]

  return operationObject
}
