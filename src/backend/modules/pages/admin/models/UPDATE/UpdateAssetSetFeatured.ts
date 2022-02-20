import { MongoHelper } from 'MongoHelper'

export async function UpdateAssetSetFeatured (assetId: string, featured: boolean): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').updateMany({
    asset_id: assetId
  }, {
    $set: {
      featured: featured
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update asset information')
  }

  return operationObject
}
