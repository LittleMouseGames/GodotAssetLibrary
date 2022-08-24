import { MongoHelper } from 'core/MongoHelper'

export async function GetSiteRestrictions (): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').findOne({
    type: 'site_restrictions'
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to fetch site settings')
  }

  return operationObject
}
