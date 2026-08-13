import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'

interface ReturnedAsset extends WithId<Document> {}

/**
 * Fetch every asset document (all variants) whose project appears in the
 * given id list — matched by either `asset_id` or `group_id` so both variant
 * ids and canonical group ids resolve. Used by the admin Homepage Hero screen
 * and by order-save validation/canonicalization.
 */
export async function GetFeaturedAssetDocs (configuredIds: string[]): Promise<Array<Record<string, any>>> {
  if (configuredIds.length === 0) {
    return []
  }

  const mongo = MongoHelper.getDatabase()
  return await mongo.collection('assets').find({
    $or: [
      { asset_id: { $in: configuredIds } },
      { group_id: { $in: configuredIds } }
    ]
  }, {
    projection: {
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
    }
  }).toArray() as ReturnedAsset[]
}
