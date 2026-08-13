import { MongoHelper } from 'core/MongoHelper'
import { providerLabel } from 'core/utils/assetProvider'
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
  /** Provider dimension: counts over the unified (group-collapsed) view. */
  sources: FacetGroup[]
}

type FacetDimension = 'categories' | 'engines' | 'types' | 'supports' | 'sources'

interface FacetSpec {
  key: keyof SearchFacets
  groupBy: string
  labelBy?: Record<string, unknown>
  /** Dimension to omit from this facet's own filter so counts stay self-excluding. */
  omit: FacetDimension
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
  { key: 'supports', groupBy: '$support_level', omit: 'supports' },
  { key: 'sources', groupBy: '$provider', omit: 'sources' }
]

const DIMENSION_KEYS: FacetDimension[] = ['categories', 'engines', 'types', 'supports', 'sources']

/** Filter for one facet with only its own dimension omitted (self-excluding). */
function facetFilterFor (query: string, options: SearchFilterOptions, omit: FacetDimension): Record<string, any> {
  return buildSearchFilter(query, {
    categories: omit === 'categories' ? undefined : options.categories,
    engines: omit === 'engines' ? undefined : options.engines,
    types: omit === 'types' ? undefined : options.types,
    supports: omit === 'supports' ? undefined : options.supports,
    // The source facet is always computed over the unified (no-source) view so
    // its options stay stable while one source is selected.
    source: omit === 'sources' ? undefined : options.source,
    featured: options.featured,
    // The major pin stays on even when self-excluding the exact-engine
    // dimension: it constrains which exact versions appear in the sidebar.
    godotMajor: options.godotMajor
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
  const facets: SearchFacets = { categories: [], engines: [], types: [], supports: [], sources: [] }

  for (const spec of FACET_SPECS) {
    const rows = output[spec.key] ?? []
    for (const item of rows) {
      if (item._id == null) continue
      const value = item._id as string
      if (value === '') continue
      facets[spec.key].push({
        value,
        label: spec.key === 'sources' ? providerLabel(value) : ((item.label as string | undefined) ?? value),
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
 * selected category does not collapse the category facet). Two shapes, in
 * order of preference:
 *
 * 1. No dimension filter selected (categories/engines/types/supports all
 *    empty) -> every facet filter is identical, so ONE outer `$match` (which
 *    keeps `$text` legal as the first stage and CAN use an index) feeds four
 *    `$group` sub-pipelines in a single `$facet`.
 * 2. Filters selected -> each facet runs as its OWN `$match`-first
 *    aggregation (in parallel). A first-stage `$facet` cannot use an index:
 *    it feeds the ENTIRE collection to every sub-pipeline in memory, so every
 *    filtered page would scan the whole collection. Separate `$match`-first
 *    pipelines keep every facet indexable. This also covers text search,
 *    where `$text` must be the first stage and cannot appear inside a `$facet`
 *    sub-pipeline at all.
 *
 * Result: 4 aggregations -> 1 for un-filtered browse/text (the common crawl
 * and user paths), staying at 4 only for filtered views.
 */
export async function GetSearchFacets (
  query: string,
  options: SearchFilterOptions = {}
): Promise<SearchFacets> {
  const mongo = MongoHelper.getDatabase()
  const assets = mongo.collection('assets')

  const hasDimensionFilters = DIMENSION_KEYS.some(dim =>
    dim === 'sources'
      ? (options.source ?? '') !== ''
      : (options[dim] ?? []).length > 0
  )

  if (!hasDimensionFilters) {
    // All four facet filters are identical, so share one $match.
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

  // Filters selected: separate $match-first aggregations per facet (see doc
  // comment above for why a first-stage $facet would scan the whole catalog).
  const results = await Promise.all(FACET_SPECS.map(async spec => {
    const filter = facetFilterFor(query, options, spec.omit)
    return await assets.aggregate([
      { $match: filter },
      groupStageFor(spec)
    ]).maxTimeMS(5000).toArray()
  }))

  const doc: Record<string, any[]> = {}
  FACET_SPECS.forEach((spec, index) => {
    doc[spec.key] = results[index]
  })
  return buildFacets(doc)
}
