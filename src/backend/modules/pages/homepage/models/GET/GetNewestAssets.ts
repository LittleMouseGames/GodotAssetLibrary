import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { assetGridSchema } from 'utility/schema/assets-grid'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetNewestAssets (): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').find({}, {
    limit: 6,
    projection: {
      category: 1,
      godot_version: 1,
      author: 1,
      title: 1,
      quick_description: 1,
      icon_url: 1,
      upvotes: 1,
      downvotes: 1,
      featured: 1,
      asset_id: 1,
      previews: 1,
      card_banner: 1
    }
  }).sort({ added_date: -1 }).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
