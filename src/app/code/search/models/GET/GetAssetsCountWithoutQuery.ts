import { MongoHelper } from 'core/MongoHelper'

export async function GetAssetsCountWithoutQuery (): Promise<number> {
  const mongo = MongoHelper.getDatabase()
  return await mongo.collection('assets').countDocuments({})
}
