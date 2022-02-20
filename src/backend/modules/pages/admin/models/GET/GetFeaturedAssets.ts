import { MongoHelper } from 'MongoHelper'

export async function GetFeaturedAssets (): Promise<[string]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').findOne({
    type: 'featured_assets'
  }, {
    projection: {
      featured_assets: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to find featured assets')
  }

  return operationObject.featured_assets
}
