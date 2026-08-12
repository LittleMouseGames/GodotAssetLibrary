import { MongoHelper } from 'core/MongoHelper'
import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'
import { godotMajorFilter } from 'core/utils/godotVersionPreference'

/**
 * Version-aware category counts for the homepage "Explore more from
 * Categories" cards. Unlike the global denormalized `info.category_count`
 * document (which spans every imported version and status), these are computed
 * from the assets collection with the public-catalog predicate AND the active
 * major pin applied, so the displayed counts always describe the exact catalog
 * a visitor reaches by clicking a category card.
 *
 * Returns a plain `{ categoryLowercase: count }` map matching the shape of
 * `GetAllCategoriesAndTheirAssetCount`.
 */
export async function GetCategoryCountsByMajor (
  major: number | undefined
): Promise<Record<string, number>> {
  const mongo = MongoHelper.getDatabase()
  const results = await mongo.collection('assets').aggregate([
    { $match: { ...PUBLIC_ASSET_FILTER, ...godotMajorFilter(major) } },
    { $group: { _id: '$category_lowercase', count: { $sum: 1 } } }
  ]).maxTimeMS(5000).toArray()

  const counts: Record<string, number> = {}
  for (const result of results) {
    const key = result._id
    if (key == null || key === '') continue
    counts[String(key)] = Number(result.count)
  }
  return counts
}
