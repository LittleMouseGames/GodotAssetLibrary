import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/utilities/fetchFromGodot/schema/assets-grid'
import { buildSearchFilter, SearchFilterOptions } from './buildSearchFilter'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

const SEARCH_FIELDS_PROJECTION: Record<string, number> = {
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
  modify_date_at: 1,
  added_date: 1,
  version_string: 1,
  type: 1,
  support_level: 1,
  download_url: 1
}

/**
 * Deterministic ordering for each sort key. "asset_rating" uses the persisted
 * confidence-adjusted rating_score (Wilson lower bound) so the ranking matches
 * the approval summary shown on cards. "last_modified" uses the normalized
 * modify_date_at date; legacy documents are backfilled by migration.
 */
function mongoSortFor (sortKey: string): Record<string, any> {
  if (sortKey === 'relevance') return { score: { $meta: 'textScore' }, asset_id: 1 }
  if (sortKey === 'asset_rating') return { rating_score: -1, upvotes: -1, downvotes: -1, asset_id: 1 }
  if (sortKey === 'newest') return { added_date: -1, asset_id: 1 }
  return { modify_date_at: -1, asset_id: 1 }
}

export async function GetAssetsFromQuery (
  query: string,
  limit: number,
  skip: number,
  sortKey: string,
  options: SearchFilterOptions = {}
): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const filter = buildSearchFilter(query, options)

  const projection: Record<string, any> = { ...SEARCH_FIELDS_PROJECTION }
  if (sortKey === 'relevance' && query !== '') {
    projection.score = { $meta: 'textScore' }
  }

  const operationObject = await mongo.collection('assets').find(filter, {
    limit,
    sort: mongoSortFor(sortKey),
    projection,
    maxTimeMS: 5000
  }).skip(skip).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
