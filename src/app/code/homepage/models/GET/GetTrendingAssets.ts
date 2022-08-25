import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/components/partials/catalog-grid/asset-grd-schema'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetTrendingAssets (): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').aggregate([{
    $sort: {
      upvotes: -1,
      godot_version: -1
    }
  }, {
    $limit: 20
  }, {
    $sample: {
      size: 6
    }
  }, {
    $sort: {
      upvotes: -1
    }
  }, {
    $project: {
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
  }]).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
