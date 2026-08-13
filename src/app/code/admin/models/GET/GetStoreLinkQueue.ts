import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { GODOT_STORE_PROVIDER } from 'core/utils/assetProvider'

interface ReturnedAsset extends WithId<Document> {}

function escapeRegex (value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Admin review queue for cross-source duplicate linking.
 *
 * With a query, searches Store assets by title / source id (for manual
 * linking). Without a query, returns the Store assets whose importer-suggested
 * legacy match is awaiting review (`link_status: 'suggested'`).
 */
export async function GetStoreLinkQueue (query = '', limit = 100): Promise<ReturnedAsset[]> {
  const mongo = MongoHelper.getDatabase()
  const filter: Record<string, any> = { provider: GODOT_STORE_PROVIDER }

  const trimmed = query.trim()
  if (trimmed !== '') {
    const pattern = escapeRegex(trimmed)
    filter.$or = [
      { title: { $regex: pattern, $options: 'i' } },
      { source_asset_id: { $regex: pattern, $options: 'i' } },
      { asset_id: { $regex: pattern, $options: 'i' } }
    ]
  } else {
    filter.link_status = 'suggested'
  }

  return await mongo.collection('assets').find(filter, {
    projection: {
      asset_id: 1,
      group_id: 1,
      title: 1,
      author: 1,
      provider: 1,
      store_url: 1,
      source_asset_id: 1,
      link_status: 1,
      link_suggestion: 1,
      link_info: 1,
      group_preferred: 1,
      is_public: 1
    },
    sort: { modify_date_at: -1, asset_id: 1 },
    limit: Math.min(200, Math.max(1, limit))
  }).toArray() as ReturnedAsset[]
}

/** Look up a single asset by its public id for admin linking actions. */
export async function GetAssetAdminView (assetId: string): Promise<ReturnedAsset | null> {
  const mongo = MongoHelper.getDatabase()
  const doc = await mongo.collection('assets').findOne({ asset_id: assetId }, {
    projection: {
      _id: 0,
      asset_id: 1,
      group_id: 1,
      group_preferred: 1,
      is_group_root: 1,
      title: 1,
      author: 1,
      provider: 1,
      source_asset_id: 1,
      store_url: 1,
      link_status: 1,
      link_suggestion: 1,
      link_info: 1,
      is_public: 1
    }
  }) as ReturnedAsset | null

  return doc
}
