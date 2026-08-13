import { MongoHelper } from 'core/MongoHelper'

/** Atomically replace the whole homepage-hero project list (curator order). */
export async function UpdateFeaturedAssetsOrder (orderedGroupIds: string[]): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').updateOne({
    type: 'featured_assets'
  }, {
    $set: {
      featured_assets: orderedGroupIds
    }
  }, {
    upsert: true
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update featured assets order')
  }
}
