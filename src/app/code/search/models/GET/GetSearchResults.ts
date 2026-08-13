import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/utilities/fetchFromGodot/schema/assets-grid'
import { buildSearchFilter, SearchFilterOptions } from './buildSearchFilter'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export interface SearchResults {
  assets: ReturnedAssets[]
  total: number
}

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
  group_id: 1,
  provider: 1,
  store_url: 1,
  license_type: 1,
  price_cent: 1,
  is_free: 1,
  source_rating: 1,
  compatibility_label: 1,
  godot_major: 1,
  godot_majors: 1,
  version_string: 1,
  previews: 1,
  card_banner: 1,
  modify_date: 1,
  modify_date_at: 1,
  added_date: 1,
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

/**
 * Fetch one page of results AND the total match count in a single aggregation.
 *
 * Replaces the old pair of `find()` + `countDocuments()` (2 round trips) with
 * one `$facet`: the `$match` runs once and its output feeds both the paged
 * `results` sub-pipeline (sort/skip/limit/project) and a `total` count
 * sub-pipeline. This halves the per-request Mongo fan-out on the busiest
 * discovery route, which directly relieves the connection-pool pressure that
 * caused the prod 503s.
 *
 * The `$match` stays the first stage of the outer pipeline, which is what
 * keeps `$text` legal (a `$text` `$match` must be first) and lets the
 * `results` sub-pipeline sort/project by `{ $meta: 'textScore' }` for the
 * relevance sort. Verified against MongoDB 5.
 */
export async function GetSearchResults (
  query: string,
  limit: number,
  skip: number,
  sortKey: string,
  options: SearchFilterOptions = {}
): Promise<SearchResults> {
  const mongo = MongoHelper.getDatabase()
  const filter = buildSearchFilter(query, options)

  const projection: Record<string, any> = { ...SEARCH_FIELDS_PROJECTION }
  if (sortKey === 'relevance' && query !== '') {
    projection.score = { $meta: 'textScore' }
  }

  const pipeline: any[] = [
    { $match: filter },
    {
      $facet: {
        results: [
          { $sort: mongoSortFor(sortKey) },
          { $skip: skip },
          { $limit: limit },
          { $project: projection }
        ],
        total: [{ $count: 'count' }]
      }
    }
  ]

  const [doc] = await mongo.collection('assets').aggregate(pipeline).maxTimeMS(5000).toArray()

  return {
    assets: ((doc?.results as any[]) ?? []) as ReturnedAssets[],
    total: ((doc?.total?.[0]?.count as number | undefined) ?? 0)
  }
}
