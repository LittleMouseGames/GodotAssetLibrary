import { MongoHelper } from 'core/MongoHelper'

/** Remove a project (by canonical group id) from the homepage-hero list. */
export async function UpdateFeaturedAssetsRemove (groupId: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').updateOne({
    type: 'featured_assets'
  }, {
    $pull: {
      featured_assets: groupId
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to pull from featured assets')
  }
}
