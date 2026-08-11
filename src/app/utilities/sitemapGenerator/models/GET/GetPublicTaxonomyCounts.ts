import { MongoHelper } from 'core/MongoHelper'
import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'

export interface TaxonomyCount {
  key: string
  count: number
}

/**
 * Distinct category keys and their public (indexable) asset counts. Unlike the
 * denormalized `info.category_count` document, these are computed from the
 * assets collection with the public-catalog predicate applied, so the sitemap
 * only lists categories that actually have indexable inventory.
 */
export async function GetPublicCategoryCounts (): Promise<TaxonomyCount[]> {
  const mongo = MongoHelper.getDatabase()
  const results = await mongo.collection('assets').aggregate([
    { $match: PUBLIC_ASSET_FILTER },
    { $group: { _id: '$category_lowercase', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).maxTimeMS(5000).toArray()
  return results.map(result => ({ key: String(result._id), count: Number(result.count) }))
}

/** Distinct Godot versions with their public asset counts. */
export async function GetPublicEngineCounts (): Promise<TaxonomyCount[]> {
  const mongo = MongoHelper.getDatabase()
  const results = await mongo.collection('assets').aggregate([
    { $match: PUBLIC_ASSET_FILTER },
    { $group: { _id: '$godot_version', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).maxTimeMS(5000).toArray()
  return results.map(result => ({ key: String(result._id), count: Number(result.count) }))
}
