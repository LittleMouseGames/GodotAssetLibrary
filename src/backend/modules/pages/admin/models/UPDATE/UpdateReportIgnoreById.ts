import { MongoHelper } from 'MongoHelper'

export async function UpdateReportIgnoreById (reportId: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reports').updateOne({
    human_id: reportId
  }, {
    $set: {
      ignored: true
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update report information')
  }

  return operationObject
}
