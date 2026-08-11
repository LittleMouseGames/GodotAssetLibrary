import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/components/partials/catalog-grid/asset-grd-schema'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetTrendingAssets (): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  // Stable "popular" ordering: confidence-adjusted rating first, then raw
  // upvotes and id as deterministic tie-breakers. No random sampling, so the
  // section does not reshuffle between requests.
  const operationObject = await mongo.collection('assets').aggregate([{
    $sort: {
      rating_score: -1,
      upvotes: -1,
      downvotes: -1,
      asset_id: 1
    }
  }, {
    $limit: 8
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
      rating_score: 1,
      featured: 1,
      asset_id: 1,
      previews: 1,
      card_banner: 1,
      modify_date: 1,
      added_date: 1,
      version_string: 1,
      type: 1,
      support_level: 1
    }
  }]).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
