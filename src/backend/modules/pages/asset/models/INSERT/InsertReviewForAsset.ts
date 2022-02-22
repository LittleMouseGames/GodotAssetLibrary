import { MongoHelper } from 'MongoHelper'
import { customAlphabet } from 'nanoid/non-secure'

/**
 *  Insert review for asset
 *
 * @param {string} userId
 * @param {string} username
 * @param {string} assetId
 * @param {string} reviewType
 * @param {string} reviewText
 * @param {string} reviewHeadline
 * @returns
 */
export async function InsertReviewForAsset (userId: string, username: string, assetId: string, reviewType: string, reviewText: string, reviewHeadline: string): Promise<any> {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 20)
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reviews').insertOne({
    human_id: nanoid(),
    username: username,
    user_id: userId,
    asset_id: assetId,
    review_type: reviewType,
    text: reviewText,
    headline: reviewHeadline,
    date: new Date()
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to insert comment')
  }

  return operationObject
}
