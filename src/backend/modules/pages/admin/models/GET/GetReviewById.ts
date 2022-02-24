import { MongoHelper } from 'MongoHelper'

export async function GetReviewById (reviewID: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()

  const operationObject = await mongo.collection('reviews').findOne({
    human_id: reviewID
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Report not found')
  }

  return operationObject
}
