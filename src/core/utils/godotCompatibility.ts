/**
 * Godot version compatibility handling for assets that expose release ranges.
 *
 * The legacy Asset Library stores one exact `godot_version` per asset. The
 * Godot Asset Store publishes one or more releases, each with a minimum and
 * maximum Godot version (either bound may be null, meaning unbounded).
 *
 * To keep discovery queries simple and indexed, we:
 * - parse versions into a numeric key (major*1e6 + minor*1e3 + patch),
 * - store the parsed ranges (`compatibility_ranges`) on each asset,
 * - materialize the set of supported major lines (`godot_majors`) so the
 *   existing major-line browsing filter can use plain array equality,
 * - keep the legacy scalar `godot_version`/`godot_major` as a backward-
 *   compatible projection of the *preferred* (usually latest stable) release.
 */

export interface GodotVersionParts {
  major: number
  minor: number
  patch: number
}

export interface GodotReleaseRange {
  /** Numeric Store release ID (the Store's immutable release identity). */
  release_id: number
  /** Original strings as supplied by the Store, preserved for display. */
  min_version: string | null
  max_version: string | null
  min_version_key: number | null
  max_version_key: number | null
  stable: boolean
  /** UTC release creation date (store release `created` is a plain date). */
  created_at: Date | null
}

export interface StoreReleaseInput {
  id?: number
  version?: string | null
  stable?: boolean
  min_godot_version?: string | null
  max_godot_version?: string | null
  created?: string | null
  /** Size in MB (Store returns a number despite the OpenAPI boolean type). */
  size?: number | boolean | null
  /** Release notes. */
  notes?: string
}

const MAJOR_SCALE = 1_000_000
const MINOR_SCALE = 1_000

/**
 * Parse a Godot version string ("4", "4.2", "4.2.1") into numeric parts.
 * Missing minor/patch components become zero. Returns null for anything that
 * is not a plain numeric dotted version (prerelease suffixes, "latest", ...).
 */
export function parseGodotVersionParts (version: unknown): GodotVersionParts | null {
  if (typeof version !== 'string') return null
  const trimmed = version.trim()
  if (trimmed === '') return null
  const parts = trimmed.split('.')
  if (parts.length < 1 || parts.length > 3) return null
  const numeric = parts.map(part => Number(part.trim()))
  if (numeric.some(value => !Number.isSafeInteger(value) || value < 0)) return null
  return {
    major: numeric[0],
    minor: numeric[1] ?? 0,
    patch: numeric[2] ?? 0
  }
}

/**
 * Numeric sort key for a version string, or null when unparseable.
 * `major * 1_000_000 + minor * 1_000 + patch`.
 */
export function parseGodotVersionKey (version: unknown): number | null {
  const parts = parseGodotVersionParts(version)
  if (parts === null) return null
  return (parts.major * MAJOR_SCALE) + (parts.minor * MINOR_SCALE) + parts.patch
}

/** Convert a range's stored keys back into display strings where possible. */
export function godotVersionKeyToString (key: number | null): string | null {
  if (key === null || !Number.isSafeInteger(key)) return null
  const major = Math.floor(key / MAJOR_SCALE)
  const remainder = key % MAJOR_SCALE
  const minor = Math.floor(remainder / MINOR_SCALE)
  const patch = remainder % MINOR_SCALE
  if (patch !== 0) return `${major}.${minor}.${patch}`
  if (minor !== 0) return `${major}.${minor}`
  return String(major)
}

/** True when a version key falls inside an inclusive [min, max] range. */
export function rangeContainsVersionKey (
  range: Pick<GodotReleaseRange, 'min_version_key' | 'max_version_key'>,
  versionKey: number
): boolean {
  if (range.min_version_key !== null && versionKey < range.min_version_key) return false
  if (range.max_version_key !== null && versionKey > range.max_version_key) return false
  return true
}

/**
 * True when a range supports ANY version of the given major line (e.g. 4.x).
 * A null bound means unbounded, so it always contains the major.
 */
export function rangeContainsMajor (range: GodotReleaseRange, major: number): boolean {
  const majorMin = major * MAJOR_SCALE
  const majorMax = majorMin + (999 * MINOR_SCALE) + 999
  if (range.min_version_key !== null && majorMax < range.min_version_key) return false
  if (range.max_version_key !== null && majorMin > range.max_version_key) return false
  return true
}

/** Parse a Store release's raw min/max into a numeric range (null on invalid). */
export function parseStoreRange (input: StoreReleaseInput): Pick<GodotReleaseRange, 'min_version_key' | 'max_version_key'> | null {
  const minKey = input.min_godot_version == null || input.min_godot_version === ''
    ? null
    : parseGodotVersionKey(input.min_godot_version)
  const maxKey = input.max_godot_version == null || input.max_godot_version === ''
    ? null
    : parseGodotVersionKey(input.max_godot_version)

  // A minimum above the maximum is an invalid range; reject it rather than
  // persisting nonsense that would confuse compatibility filters.
  if (minKey !== null && maxKey !== null && minKey > maxKey) return null

  return { min_version_key: minKey, max_version_key: maxKey }
}

function parseStoreDate (value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  // Store dates are ISO-like without a timezone suffix; normalize to UTC.
  const candidate = /(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim()) ? value.trim() : `${value.trim()}Z`
  const date = new Date(candidate)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Normalize a list of Store releases into bounded compatibility ranges.
 * The stable-preferred / newest selection used for the legacy scalar
 * projection is computed by `choosePreferredRelease` from these ranges.
 */
export function normalizeGodotRanges (releases: StoreReleaseInput[]): GodotReleaseRange[] {
  if (!Array.isArray(releases)) return []
  const ranges: GodotReleaseRange[] = []

  for (const release of releases) {
    if (release === null || typeof release !== 'object') continue
    const id = Number(release.id)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    const parsed = parseStoreRange(release)
    if (parsed === null) continue
    ranges.push({
      release_id: id,
      min_version: typeof release.min_godot_version === 'string' && release.min_godot_version !== ''
        ? release.min_godot_version
        : null,
      max_version: typeof release.max_godot_version === 'string' && release.max_godot_version !== ''
        ? release.max_godot_version
        : null,
      min_version_key: parsed.min_version_key,
      max_version_key: parsed.max_version_key,
      stable: release.stable === true,
      created_at: parseStoreDate(release.created)
    })
  }

  return ranges
}

/**
 * Pick the release that should drive the scalar `godot_version`/`godot_major`
 * projection: stable releases before unstable, then newest creation date,
 * then highest numeric release ID as the deterministic tie-breaker.
 */
export function choosePreferredRelease (ranges: GodotReleaseRange[]): GodotReleaseRange | null {
  if (ranges.length === 0) return null
  const sorted = [...ranges].sort((a, b) => {
    if (a.stable !== b.stable) return a.stable ? -1 : 1
    const aTime = a.created_at?.getTime() ?? 0
    const bTime = b.created_at?.getTime() ?? 0
    if (aTime !== bTime) return bTime - aTime
    return b.release_id - a.release_id
  })
  return sorted[0] ?? null
}

const DEFAULT_SUPPORTED_MAJORS = [2, 3, 4]

/**
 * Materialize the set of Godot major lines supported by any release range.
 * Used to backfill the `godot_majors` array used by major-line browsing.
 */
export function materializeGodotMajors (
  ranges: GodotReleaseRange[],
  supportedMajors: number[] = DEFAULT_SUPPORTED_MAJORS
): number[] {
  const majors = new Set<number>()
  for (const range of ranges) {
    for (const major of supportedMajors) {
      if (rangeContainsMajor(range, major)) majors.add(major)
    }
  }
  return [...majors].sort((a, b) => a - b)
}

export interface GodotCompatibilitySummary {
  /** Preferred release's minimum (or maximum when no minimum) version string. */
  godot_version: string
  /** Numeric major of the preferred release. */
  godot_major: number | undefined
  /** All major lines supported by any release. */
  godot_majors: number[]
  /** Display label for the preferred release, e.g. "Godot 4.5.1+". */
  compatibility_label: string
}

/**
 * Build the backward-compatible scalar projection + materialized majors from a
 * list of Store releases. Returns empty-string/undefined values when there is
 * no usable release, so the caller can mark the asset non-searchable.
 */
export function buildCompatibilitySummary (releases: StoreReleaseInput[]): GodotCompatibilitySummary {
  const ranges = normalizeGodotRanges(releases)
  const preferred = choosePreferredRelease(ranges)

  const minKey = preferred?.min_version_key ?? null
  const maxKey = preferred?.max_version_key ?? null
  const godotVersion = preferred !== null
    ? (godotVersionKeyToString(minKey ?? maxKey) ?? '')
    : ''

  const godotMajor = godotVersion !== ''
    ? (parseGodotVersionParts(godotVersion)?.major)
    : undefined

  let compatibilityLabel = ''
  if (preferred !== null) {
    const min = godotVersionKeyToString(minKey)
    const max = godotVersionKeyToString(maxKey)
    if (min !== null && max !== null && min !== max) {
      compatibilityLabel = `Godot ${min} \u2013 ${max}`
    } else if (min !== null) {
      compatibilityLabel = `Godot ${min}+`
    } else if (max !== null) {
      compatibilityLabel = `Godot ${max} and older`
    }
  }

  return {
    godot_version: godotVersion,
    godot_major: godotMajor,
    godot_majors: materializeGodotMajors(ranges),
    compatibility_label: compatibilityLabel
  }
}
