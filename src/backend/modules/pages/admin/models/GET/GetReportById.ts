import { MongoHelper } from 'MongoHelper'

export async function GetReportById (reportId: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()

  const operationObject = await mongo.collection('reports').findOne({
    human_id: reportId
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Report not found')
  }

  return operationObject
}
