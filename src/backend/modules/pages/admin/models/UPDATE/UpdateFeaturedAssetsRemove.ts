import { MongoHelper } from 'MongoHelper'

export async function UpdateFeaturedAssetsRemove (assetId: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').updateOne({
    type: 'featured_assets'
  }, {
    $pull: {
      featured_assets: assetId
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to pull from featured assets')
  }
}
