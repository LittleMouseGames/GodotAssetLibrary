import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/utilities/fetchFromGodot/schema/assets-grid'
import { UNIFIED_DISCOVERY_FILTER } from 'core/utils/publicCatalog'
import { godotMajorFilter } from 'core/utils/godotVersionPreference'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetFourAssetsForHomepage (major?: number): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  // Curated featured assets, deterministically ordered by confidence-adjusted
  // rating so the section does not reshuffle between requests. Filtered to the
  // pinned major before sorting/limiting so the section stays in-generation.
  const operationObject = await mongo.collection('assets').aggregate([{
    $match: {
      ...UNIFIED_DISCOVERY_FILTER,
      ...godotMajorFilter(major),
      featured: true
    }
  }, {
    $sort: {
      rating_score: -1,
      upvotes: -1,
      asset_id: 1
    }
  }, {
    $limit: 3
  }, {
    $project: {
      category: 1,
      godot_version: 1,
      godot_major: 1,
      godot_majors: 1,
      provider: 1,
      group_id: 1,
      store_url: 1,
      license_type: 1,
      price_cent: 1,
      is_free: 1,
      source_rating: 1,
      compatibility_label: 1,
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
