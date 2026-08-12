/**
 * Canonical handling for the persistent Godot-version (major-line) browsing
 * preference exposed through the site header.
 *
 * The site stores exact compatibility strings (e.g. "3.4", "4.2") per asset.
 * Browsing, however, is organized by major line ("2.x", "3.x", "4.x", "All")
 * so the homepage, search/category listings and related cards describe the
 * catalog the visitor actually wants, defaulting to Godot 4.x.
 *
 * Conventions:
 * - The preference value is one of `'2'`, `'3'`, `'4'`, `'all'` (string).
 * - Missing/invalid preferences resolve to `'4'` (the default).
 * - Explicit exact engine filters (`?engine=3.4`, `/engine/3.4`) override the
 *   major for that request (see deriveEffectiveMajor).
 * - A normalized numeric `godot_major` is persisted on each asset so Mongo can
 *   filter with an equality match backed by an index (prefix regex over the
 *   exact `godot_version` string is slower and cannot use a compound index).
 */

export type GodotVersionPreference = '2' | '3' | '4' | 'all'

export const GODOT_VERSION_PREFERENCE_COOKIE = 'godot_version'
export const DEFAULT_GODOT_VERSION_PREFERENCE: GodotVersionPreference = '4'

export const GODOT_VERSION_PREFERENCES: ReadonlyArray<{ value: GodotVersionPreference, label: string }> = [
  { value: '2', label: '2.x' },
  { value: '3', label: '3.x' },
  { value: '4', label: '4.x' },
  { value: 'all', label: 'All' }
]

const PREFERENCE_VALUES = new Set<string>(['2', '3', '4', 'all'])

export function isGodotVersionPreference (value: unknown): value is GodotVersionPreference {
  return typeof value === 'string' && PREFERENCE_VALUES.has(value)
}

/** Parse a stored cookie/body value, returning the default for anything invalid. */
export function normalizeGodotVersionPreference (value: unknown): GodotVersionPreference {
  return isGodotVersionPreference(value) ? value : DEFAULT_GODOT_VERSION_PREFERENCE
}

/** Display label for a preference value ("2.x", "3.x", "4.x", "All"). */
export function godotVersionPreferenceLabel (value: GodotVersionPreference): string {
  return value === 'all' ? 'All' : `${value}.x`
}

/**
 * Numeric major of an exact Godot version string, or `undefined` when the
 * value cannot be parsed (e.g. blank, "latest", or a non-numeric prefix).
 */
export function parseGodotMajor (godotVersion: unknown): number | undefined {
  if (typeof godotVersion !== 'string') return undefined
  const major = Number.parseInt(godotVersion.trim(), 10)
  if (!Number.isFinite(major) || major < 1) return undefined
  return major
}

/**
 * Derive the effective major for a discovery request.
 *
 * Exact engine filters override the persistent preference for that request:
 * - one exact selection (or several, all sharing one major) -> that major
 * - several exact selections spanning multiple majors -> `undefined` (all)
 * - no exact selection -> the persistent preference
 */
export function deriveEffectiveMajor (
  engines: string[],
  preference: GodotVersionPreference
): number | undefined {
  if (engines.length > 0) {
    const majors = new Set<number>()
    for (const engine of engines) {
      const major = parseGodotMajor(engine)
      if (major !== undefined) majors.add(major)
    }
    if (majors.size === 1) {
      return [...majors][0]
    }
    return undefined
  }
  if (preference === 'all') return undefined
  return Number(preference)
}

/** Mongo predicate restricting assets to one major line (empty when none). */
export function godotMajorFilter (major: number | undefined): Record<string, unknown> {
  return major === undefined ? {} : { godot_major: major }
}

/** Stable suffix used in cache keys; "all" for no major restriction. */
export function godotMajorCacheSuffix (major: number | undefined): string {
  return major === undefined ? 'all' : String(major)
}

/**
 * Every cache variant a public asset bundle can be served under. Review and
 * admin mutations must invalidate each variant so a fresh rating/report is
 * reflected regardless of the visitor's pinned major.
 */
export const GODOT_MAJOR_CACHE_VARIANTS: ReadonlyArray<number | undefined> = [2, 3, 4, undefined]
