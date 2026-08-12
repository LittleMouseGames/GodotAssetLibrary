import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/components/partials/catalog-grid/asset-grd-schema'
import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'
import { godotMajorFilter } from 'core/utils/godotVersionPreference'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

/**
 * Related assets with compatibility-aware fallback tiers. A bounded pool of
 * same-category assets is ranked by how close each peer is to the current
 * asset: exact Godot version first, then same major version, then same type,
 * then by confidence-adjusted rating and recency.
 *
 * When a major pin is active (the caller passes `major`), the pool is strictly
 * constrained to that major line before ranking, so related cards never show
 * assets from another engine generation.
 */
export async function GetRelatedAssets (
  category: string,
  godotVersion: string | undefined,
  assetType: string | undefined,
  excludeAssetId: string,
  major?: number
): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()

  const pool = await mongo.collection('assets').find(
    {
      ...PUBLIC_ASSET_FILTER,
      ...godotMajorFilter(major),
      asset_id: { $ne: excludeAssetId },
      category: category
    },
    {
      limit: 12,
      sort: { rating_score: -1, upvotes: -1, asset_id: 1 },
      projection: {
        category: 1,
        godot_version: 1,
        godot_major: 1,
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
  ).toArray() as ReturnedAssets[]

  const assetMajor = godotVersion?.split('.')[0]
  const ranked = pool
    .map(asset => {
      let tier = 3
      if (godotVersion !== undefined && godotVersion !== '' && asset.godot_version === godotVersion) {
        tier = 0
      } else if (assetMajor !== undefined && assetMajor !== '' && String(asset.godot_version ?? '').split('.')[0] === assetMajor) {
        tier = 1
      } else if (assetType !== undefined && assetType !== '' && asset.type === assetType) {
        tier = 2
      }
      return { asset, tier }
    })
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      const aScore = Number(a.asset.rating_score ?? 0)
      const bScore = Number(b.asset.rating_score ?? 0)
      if (aScore !== bScore) return bScore - aScore
      const aUp = Number(a.asset.upvotes ?? 0)
      const bUp = Number(b.asset.upvotes ?? 0)
      if (aUp !== bUp) return bUp - aUp
      return String(a.asset.asset_id).localeCompare(String(b.asset.asset_id))
    })

  return ranked.slice(0, 4).map(entry => entry.asset)
}
