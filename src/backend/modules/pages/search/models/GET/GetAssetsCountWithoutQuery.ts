import { MongoHelper } from 'MongoHelper'

export async function GetAssetsCountWithoutQuery (): Promise<number> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').find().count()

  if (operationObject === null || operationObject === undefined) {
    return 0
  }

  return operationObject
}
