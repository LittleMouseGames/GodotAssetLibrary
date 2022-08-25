import { MongoHelper } from 'core/MongoHelper'

export async function GetAssetsWithoutReadme (): Promise<any[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').find({ readme: null }, {
    projection: {
      download_url: 1,
      asset_id: 1
    }
  }).toArray() as any[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
