import { MongoHelper } from 'core/MongoHelper'
import { buildSearchFilter, SearchFilterOptions } from './buildSearchFilter'

export interface FacetGroup {
  /** Canonical key used in URLs, checkbox values, chips and Mongo matching. */
  value: string
  /** Human-readable label for display (e.g. "2D Tools"). */
  label: string
  count: number
}

export interface SearchFacets {
  categories: FacetGroup[]
  engines: FacetGroup[]
  types: FacetGroup[]
  supports: FacetGroup[]
}

interface FacetSpec {
  key: keyof SearchFacets
  groupBy: string
  labelBy?: Record<string, unknown>
  /** Dimension to omit from this facet's own filter so counts stay self-excluding. */
  omit: 'categories' | 'engines' | 'types' | 'supports'
}

const FACET_SPECS: FacetSpec[] = [
  {
    key: 'categories',
    groupBy: '$category_lowercase',
    labelBy: { $first: '$category' },
    omit: 'categories'
  },
  { key: 'engines', groupBy: '$godot_version', omit: 'engines' },
  { key: 'types', groupBy: '$type', omit: 'types' },
  { key: 'supports', groupBy: '$support_level', omit: 'supports' }
]

const DIMENSION_KEYS: Array<FacetSpec['omit']> = ['categories', 'engines', 'types', 'supports']

/** Filter for one facet with only its own dimension omitted (self-excluding). */
function facetFilterFor (query: string, options: SearchFilterOptions, omit: FacetSpec['omit']): Record<string, any> {
  return buildSearchFilter(query, {
    categories: omit === 'categories' ? undefined : options.categories,
    engines: omit === 'engines' ? undefined : options.engines,
    types: omit === 'types' ? undefined : options.types,
    supports: omit === 'supports' ? undefined : options.supports,
    featured: options.featured
  })
}

function groupStageFor (spec: FacetSpec): Record<string, any> {
  const group: Record<string, any> = { _id: spec.groupBy, count: { $sum: 1 } }
  if (spec.labelBy !== undefined) {
    group.label = spec.labelBy
  }
  return { $group: group }
}

/** Normalize raw facet rows ({_id, count, label?}) into FacetGroup arrays. */
function buildFacets (output: Record<string, any[]>): SearchFacets {
  const facets: SearchFacets = { categories: [], engines: [], types: [], supports: [] }

  for (const spec of FACET_SPECS) {
    const rows = output[spec.key] ?? []
    for (const item of rows) {
      if (item._id == null) continue
      const value = item._id as string
      if (value === '') continue
      facets[spec.key].push({
        value,
        label: (item.label as string | undefined) ?? value,
        count: item.count as number
      })
    }
  }

  return facets
}

/**
 * Disjunctive (self-excluding) facets, consolidated to cut Mongo fan-out.
 *
 * Each facet omits only its own dimension so counts stay self-excluding (a
 * selected category does not collapse the category facet). Three shapes, in
 * order of preference, to minimise round trips:
 *
 * 1. No dimension filter selected (categories/engines/types/supports all
 *    empty) -> every facet filter is identical, so ONE outer `$match` (which
 *    keeps `$text` legal as the first stage) feeds four `$group`
 *    sub-pipelines in a single `$facet`.
 * 2. Browsing (no `$text`) with filters selected -> the self-excluding
 *    `$match` can live inside each `$facet` sub-pipeline, so all four facets
 *    still run in one aggregation.
 * 3. Text search with filters selected -> `$text` cannot appear inside `$facet`
 *    sub-pipelines (it must be the first stage of its own pipeline), so each
 *    facet runs as a separate aggregation.
 *
 * Result: 4 aggregations -> 1 for browse and for plain text searches (the
 * common crawl/user paths), staying at 4 only for search + selected filters.
 */
export async function GetSearchFacets (
  query: string,
  options: SearchFilterOptions = {}
): Promise<SearchFacets> {
  const mongo = MongoHelper.getDatabase()
  const assets = mongo.collection('assets')

  const hasDimensionFilters = DIMENSION_KEYS.some(dim => (options[dim] ?? []).length > 0)

  if (!hasDimensionFilters) {
    // Strategy 1: all four facet filters are identical, so share one $match.
    const filter = buildSearchFilter(query, options)
    const facetStages: Record<string, any[]> = {}
    for (const spec of FACET_SPECS) {
      facetStages[spec.key] = [groupStageFor(spec)]
    }
    const [doc] = await assets.aggregate([
      { $match: filter },
      { $facet: facetStages }
    ]).maxTimeMS(5000).toArray()
    return buildFacets(doc ?? {})
  }

  if (query === '') {
    // Strategy 2: browse with filters; each sub-pipeline has its own $match.
    const facetStages: Record<string, any[]> = {}
    for (const spec of FACET_SPECS) {
      facetStages[spec.key] = [
        { $match: facetFilterFor(query, options, spec.omit) },
        groupStageFor(spec)
      ]
    }
    const [doc] = await assets.aggregate([
      { $facet: facetStages }
    ]).maxTimeMS(5000).toArray()
    return buildFacets(doc ?? {})
  }

  // Strategy 3: text search with filters selected -> separate aggregations.
  const results = await Promise.all(FACET_SPECS.map(async spec => {
    const filter = facetFilterFor(query, options, spec.omit)
    const pipeline: any[] = [
      { $match: filter },
      groupStageFor(spec)
    ]
    return await assets.aggregate(pipeline).maxTimeMS(5000).toArray()
  }))

  const doc: Record<string, any[]> = {}
  FACET_SPECS.forEach((spec, index) => {
    doc[spec.key] = results[index]
  })
  return buildFacets(doc)
}
