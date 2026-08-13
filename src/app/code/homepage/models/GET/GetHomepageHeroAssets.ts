import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import {
  HomepageHeroAsset,
  collectGroupIds,
  resolveCuratedHeroAssets
} from 'core/utils/homepageHero'

interface ReturnedAsset extends WithId<Document> {}

/** Projection for a hero-relevant asset document. */
const HERO_ASSET_PROJECTION = {
  _id: 0,
  asset_id: 1,
  group_id: 1,
  group_preferred: 1,
  is_group_root: 1,
  is_public: 1,
  source_status: 1,
  provider: 1,
  title: 1,
  author: 1,
  quick_description: 1,
  category: 1,
  category_lowercase: 1,
  godot_version: 1,
  godot_major: 1,
  godot_majors: 1,
  compatibility_label: 1,
  version_string: 1,
  card_banner: 1,
  icon_url: 1,
  previews: 1,
  upvotes: 1,
  downvotes: 1,
  source_rating: 1,
  store_url: 1,
  price_cent: 1,
  is_free: 1,
  cost: 1,
  license_type: 1
} as const

/**
 * Resolve the curated, ordered homepage hero for the active Godot major.
 *
 * The ordered project ids come from the admin-maintained `featured_assets`
 * info document. We load every variant of those projects (NOT just the
 * preferred record) because the globally preferred variant may be
 * incompatible with the pinned major and an eligible sibling should
 * represent the project instead. Editorial order is preserved by the pure
 * resolver; no rating sort or fixed limit is applied here.
 */
export async function GetHomepageHeroAssets (
  configuredIds: string[],
  major: number | undefined
): Promise<HomepageHeroAsset[]> {
  if (configuredIds.length === 0) {
    return []
  }

  const mongo = MongoHelper.getDatabase()
  const collection = mongo.collection('assets')

  // Phase 1: find the configured docs (by id or group) to discover the
  // canonical group ids. A configured id may be a VARIANT id rather than the
  // root (old data / legacy curation), so the group list must be expanded or
  // the pinned-major sibling/root fallback would have no eligible candidates.
  const seed = await collection.find({
    $or: [
      { asset_id: { $in: configuredIds } },
      { group_id: { $in: configuredIds } }
    ]
  }, {
    projection: { _id: 0, asset_id: 1, group_id: 1 }
  }).toArray() as unknown as Array<{ asset_id: string, group_id?: string }>

  const groupIds = collectGroupIds(seed)

  // Phase 2: load EVERY variant of every discovered group so the pure resolver
  // can pick the best public display variant for the pinned major.
  const assets = await collection.find({
    group_id: { $in: groupIds }
  }, {
    projection: HERO_ASSET_PROJECTION
  }).toArray() as ReturnedAsset[]

  return resolveCuratedHeroAssets(configuredIds, assets as Array<Record<string, any>>, major)
}
