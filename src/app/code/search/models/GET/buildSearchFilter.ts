export interface SearchFilterOptions {
  categories?: string[]
  engines?: string[]
  types?: string[]
  supports?: string[]
  featured?: boolean
}

/**
 * Build the MongoDB filter for discovery. All filter values use canonical
 * lowercase keys (category_lowercase) so query parameters, facet values,
 * chips, and stored data always agree.
 */
export function buildSearchFilter (query: string, options: SearchFilterOptions = {}): Record<string, any> {
  const { categories, engines, types, supports, featured } = options
  const filter: Record<string, any> = {}

  if (categories !== undefined && categories.length > 0) {
    filter.category_lowercase = { $in: categories }
  }

  if (engines !== undefined && engines.length > 0) {
    filter.godot_version = { $in: engines }
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
