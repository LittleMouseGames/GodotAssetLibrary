import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { assetSchema } from 'utility/schema/assets'

interface ReturnedAssets extends WithId<Document>, assetSchema {}

export async function GetFourAssets (): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').find({}, { limit: 4 }).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
