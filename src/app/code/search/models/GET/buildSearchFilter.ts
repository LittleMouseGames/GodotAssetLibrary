export function buildSearchFilter (
  query: string,
  categoryArray: string[],
  engineArray: string[]
): Record<string, any> {
  const filter: Record<string, any> = {}

  if (categoryArray.length > 0) {
    filter.category_lowercase = { $in: categoryArray }
  }

  if (engineArray.length > 0) {
    filter.godot_version = { $in: engineArray }
  }

  if (query !== '') {
    filter.$text = { $search: query, $caseSensitive: false }
  }

  return filter
}
