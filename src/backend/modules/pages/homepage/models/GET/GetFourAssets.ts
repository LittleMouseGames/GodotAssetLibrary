import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'

interface ReturnedAssets extends WithId<Document> {
  category: String
  godot_version: String
  author: String
  title: String
  description: String
  quick_description: String
  icon_url: String
  upvotes: number
  downvotes: number
  featured: boolean
  asset_id: String
}

export async function GetFourAssets (): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').find({}, {
    limit: 4,
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
      asset_id: 1
    }
  }).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
