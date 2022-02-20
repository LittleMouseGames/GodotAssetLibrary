import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { comments } from 'utility/schema/comments'

interface ReturnedComment extends WithId<Document>, comments {}

/**
 * Get asset review for user
 *
 * @param {string} assetId
 * @param {string} userId
 * @returns {ReturnedComment}
 */
export async function GetAssetCommentByUserId (assetId: string, userId: string): Promise<ReturnedComment> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('comments').findOne({ asset_id: assetId, user_id: userId }) as ReturnedComment

  return operationObject
}
