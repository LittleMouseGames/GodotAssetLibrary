import { MongoHelper } from 'core/MongoHelper'

/**
 * The ordered list of homepage-hero project ids, stored as the existing
 * `featured_assets` info document. Empty-safe: an absent document (fresh
 * install, never-curated) is an empty list, not an error.
 */
export async function GetFeaturedAssets (): Promise<string[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').findOne({
    type: 'featured_assets'
  }, {
    projection: {
      featured_assets: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return []
  }

  const list = operationObject.featured_assets
  return Array.isArray(list) ? list.map(String) : []
}
