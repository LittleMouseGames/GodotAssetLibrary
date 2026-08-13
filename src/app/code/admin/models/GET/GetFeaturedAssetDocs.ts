import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { collectGroupIds } from 'core/utils/homepageHero'

interface ReturnedAsset extends WithId<Document> {}

/** Projection for an admin Homepage Hero row document. */
const ADMIN_ROW_PROJECTION = {
  _id: 0,
  asset_id: 1,
  group_id: 1,
  group_preferred: 1,
  is_group_root: 1,
  is_public: 1,
  provider: 1,
  title: 1,
  author: 1,
  card_banner: 1,
  icon_url: 1,
  previews: 1
} as const

/**
 * Fetch every asset document (all variants) whose project appears in the
 * given id list — matched by either `asset_id` or `group_id` so both variant
 * ids and canonical group ids resolve. A configured id may be a VARIANT id,
 * so the discovered group ids are expanded before the full fetch; otherwise
 * admin rows could misreport provider/public status and order canonicalization
 * would lack full group context. Used by the admin Homepage Hero screen and by
 * order-save validation/canonicalization.
 */
export async function GetFeaturedAssetDocs (configuredIds: string[]): Promise<Array<Record<string, any>>> {
  if (configuredIds.length === 0) {
    return []
  }

  const mongo = MongoHelper.getDatabase()
  const collection = mongo.collection('assets')

  // Phase 1: discover the canonical group ids for the configured ids.
  const seed = await collection.find({
    $or: [
      { asset_id: { $in: configuredIds } },
      { group_id: { $in: configuredIds } }
    ]
  }, {
    projection: { _id: 0, asset_id: 1, group_id: 1 }
  }).toArray() as unknown as Array<{ asset_id: string, group_id?: string }>

  const groupIds = collectGroupIds(seed)

  // Phase 2: load every variant of each discovered group.
  return await collection.find({
    group_id: { $in: groupIds }
  }, {
    projection: ADMIN_ROW_PROJECTION
  }).toArray() as ReturnedAsset[]
}
