import { MongoHelper } from 'MongoHelper'
import { customAlphabet } from 'nanoid/non-secure'

export async function InsertReviewReport (userId: string, reportReason: string, reportNotes: string, reviewId: string): Promise<any> {
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 20)
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reports').insertOne({
    human_id: nanoid(),
    type: 'review',
    user_id: userId,
    reason: reportReason,
    notes: reportNotes,
    review_id: reviewId,
    date: new Date()
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to insert report')
  }

  return operationObject
}
