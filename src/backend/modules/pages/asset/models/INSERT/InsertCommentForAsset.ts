import { MongoHelper } from 'MongoHelper'
import { customAlphabet } from 'nanoid/non-secure'

export async function InsertCommentForAsset (userId: string, assetId: string, reviewType: string, reviewText: string, reviewHeadline: string): Promise<any> {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 20)
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('comments').insertOne({
    human_id: nanoid(),
    userId: userId,
    assetId: assetId,
    reviewType: reviewType,
    reviewText: reviewText,
    reviewHeadline: reviewHeadline,
    date: new Date()
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to insert comment')
  }

  return operationObject
}
