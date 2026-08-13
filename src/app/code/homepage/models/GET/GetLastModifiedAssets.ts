import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/components/partials/catalog-grid/asset-grd-schema'
import { UNIFIED_DISCOVERY_FILTER } from 'core/utils/publicCatalog'
import { godotMajorFilter } from 'core/utils/godotVersionPreference'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetLastModifiedAssets (major?: number): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  // Deterministic "Recently updated" ordering by the normalized modify_date_at
  // timestamp (asset_id as a stable tie-breaker). The major pin is applied
  // before sorting/limiting. modify_date_at is projected so the visible
  // "Updated ... ago" context matches the ordering, the sitemap and JSON-LD.
  const operationObject = await mongo.collection('assets').find(
    { ...UNIFIED_DISCOVERY_FILTER, ...godotMajorFilter(major) },
    {
      limit: 8,
      projection: {
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
        modify_date_at: 1,
        added_date: 1,
        version_string: 1,
        type: 1,
        support_level: 1
      }
    }
  ).sort({ modify_date_at: -1, asset_id: 1 }).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
