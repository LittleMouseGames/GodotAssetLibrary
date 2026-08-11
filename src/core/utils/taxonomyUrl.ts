/**
 * Canonical taxonomy URL helpers.
 *
 * Category keys are stored lowercased with spaces (e.g. "2d tools") and the
 * canonical path URL-encodes the space ("%20"). A literal `+` is only decoded
 * as a space in query strings, so `/category/2d+tools` is a genuinely
 * different URL from `/category/2d%20tools` serving the same content. These
 * helpers plus the controller redirects consolidate every spelling onto one
 * canonical path.
 */

/** Normalize a raw category/engine value to its canonical lowercase key. */
export function normalizeTaxonomyKey (value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\+|&plus;|%2b|%20/g, ' ')
    .replace(/\s+/g, ' ')
}

/** Canonical path for a category key, e.g. "/category/2d%20tools". */
export function buildCategoryPath (key: string): string {
  const normalized = normalizeTaxonomyKey(key)
  return normalized === '' ? '' : `/category/${encodeURIComponent(normalized)}`
}

/** Canonical path for a Godot version key, e.g. "/engine/3.4". */
export function buildEnginePath (key: string): string {
  const normalized = normalizeTaxonomyKey(key)
  return normalized === '' ? '' : `/engine/${encodeURIComponent(normalized)}`
}

/** Title-case a category key for display (e.g. "2d tools" -> "2D Tools"). */
export function displayCategoryLabel (key: string): string {
  return normalizeTaxonomyKey(key)
    .split(' ')
    .filter(part => part !== '')
    .map(part => {
      const upper = part.toLocaleUpperCase()
      // Keep common abbreviations all-caps ("2D", "3D", "UI") and title-case
      // everything else.
      if (/^[a-z0-9]{1,2}$/i.test(part) && /\d/.test(part)) return upper
      return upper.charAt(0) + part.slice(1)
    })
    .join(' ')
}
