import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'
import { godotMajorFilter } from 'core/utils/godotVersionPreference'

export interface SearchFilterOptions {
  categories?: string[]
  engines?: string[]
  types?: string[]
  supports?: string[]
  featured?: boolean
  /**
   * Numeric Godot major line to restrict discovery to (e.g. 4 for "4.x").
   * Only set while the visitor has no explicit exact-engine selection so the
   * pinned major can be lifted once they choose exact versions.
   */
  godotMajor?: number
}

/**
 * Build the MongoDB filter for discovery. All filter values use canonical
 * lowercase keys (category_lowercase) so query parameters, facet values,
 * chips, and stored data always agree. The public-catalog predicate is always
 * applied so unavailable and non-searchable assets never surface in results,
 * counts or facets (matching the sitemap).
 */
export function buildSearchFilter (query: string, options: SearchFilterOptions = {}): Record<string, any> {
  const { categories, engines, types, supports, featured, godotMajor } = options
  const filter: Record<string, any> = { ...PUBLIC_ASSET_FILTER }

  if (categories !== undefined && categories.length > 0) {
    filter.category_lowercase = { $in: categories }
  }

  if (engines !== undefined && engines.length > 0) {
    filter.godot_version = { $in: engines }
  } else {
    // The major pin applies only while no exact engine selection overrides it.
    Object.assign(filter, godotMajorFilter(godotMajor))
  }

  if (types !== undefined && types.length > 0) {
    filter.type = { $in: types }
  }

  if (supports !== undefined && supports.length > 0) {
    filter.support_level = { $in: supports }
  }

  if (featured === true) {
    filter.featured = true
  }

  if (query !== '') {
    filter.$text = { $search: query, $caseSensitive: false }
  }

  return filter
}
