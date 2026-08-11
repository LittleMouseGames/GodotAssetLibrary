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

/**
 * Disjunctive (self-excluding) facets.
 *
 * Each facet runs its own aggregation that begins with the applicable $match,
 * which keeps a $text $match legal as the first stage on MongoDB 5. Omitting
 * only the facet's own dimension means a selected category does not collapse
 * the category facet, so users can still add alternate values.
 */
export async function GetSearchFacets (
  query: string,
  options: SearchFilterOptions = {}
): Promise<SearchFacets> {
  const mongo = MongoHelper.getDatabase()
  const assets = mongo.collection('assets')

  const specs: FacetSpec[] = [
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

  const results = await Promise.all(specs.map(async spec => {
    // Omit only the facet's own dimension so counts stay self-excluding.
    const facetOptions: SearchFilterOptions = {
      categories: spec.omit === 'categories' ? undefined : options.categories,
      engines: spec.omit === 'engines' ? undefined : options.engines,
      types: spec.omit === 'types' ? undefined : options.types,
      supports: spec.omit === 'supports' ? undefined : options.supports,
      featured: options.featured
    }
    const filter = buildSearchFilter(query, facetOptions)

    const group: Record<string, unknown> = { _id: spec.groupBy, count: { $sum: 1 } }
    if (spec.labelBy !== undefined) group.label = spec.labelBy

    const pipeline: any[] = [
      { $match: filter },
      { $group: group }
    ]

    return await assets.aggregate(pipeline).maxTimeMS(5000).toArray()
  }))

  const output: SearchFacets = { categories: [], engines: [], types: [], supports: [] }

  specs.forEach((spec, index) => {
    for (const item of results[index]) {
      if (item._id == null) continue
      const value = item._id as string
      if (value === '') continue
      output[spec.key].push({
        value,
        label: (item.label as string | undefined) ?? value,
        count: item.count as number
      })
    }
  })

  return output
}
