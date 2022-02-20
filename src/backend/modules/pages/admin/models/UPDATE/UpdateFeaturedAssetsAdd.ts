import { MongoHelper } from 'MongoHelper'

export async function UpdateFeaturedAssetsAdd (assetId: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').updateOne({
    type: 'featured_assets'
  }, {
    $push: {
      featured_assets: assetId
    }
  }, {
    upsert: true
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update (or upsert) featured assets')
  }
}
