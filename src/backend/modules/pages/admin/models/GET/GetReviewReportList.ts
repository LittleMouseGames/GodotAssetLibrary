import { MongoHelper } from 'MongoHelper'

export async function GetReviewReportList (limit: number = 12, skip: number): Promise<any[]> {
  const mongo = MongoHelper.getDatabase()

  const operationObject = await mongo.collection('reports').find({
    type: 'review',
    ignored: {
      $ne: true
    },
    approved: {
      $ne: true
    }
  }, {
    limit: limit
  }).skip(skip).toArray()

  if (operationObject === null || operationObject === undefined) {
    return []
  }

  return operationObject
}
