import { MongoHelper } from 'core/MongoHelper'
import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'
import { normalizeGodotVersionPreference } from 'core/utils/godotVersionPreference'

/**
 * Short-lived, in-process memo of which numeric Godot major lines currently
 * have publicly discoverable assets. The catalog only changes on the nightly
 * import, so a brief TTL keeps this cheap without ever going stale long.
 */
let availabilityCache: { at: number, majors: Set<number> } | null = null
const AVAILABILITY_TTL_MS = 5 * 60_000

async function getPublicMajorAvailability (): Promise<Set<number>> {
  if (availabilityCache !== null && Date.now() - availabilityCache.at < AVAILABILITY_TTL_MS) {
    return availabilityCache.majors
  }

  try {
    const mongo = MongoHelper.getDatabase()
    const rows = await mongo.collection('assets').aggregate([
      { $match: PUBLIC_ASSET_FILTER },
      { $group: { _id: '$godot_major' } }
    ]).maxTimeMS(3000).toArray()

    const majors = new Set<number>()
    for (const row of rows) {
      if (typeof row._id === 'number') majors.add(row._id)
    }
    availabilityCache = { at: Date.now(), majors }
    return majors
  } catch (e) {
    // Fail-open on a query error: report nothing available so the caller's
    // default fallback (show all) keeps the site populated.
    return new Set<number>()
  }
}

/**
 * Resolve the numeric major that public discovery (homepage, search/category
 * listings, related cards) should be filtered to.
 *
 * - No cookie (a first-time visitor who never touched the dropdown): the
 *   implicit default is 4.x, but when the public catalog contains no Godot 4
 *   assets the effective major falls back to `undefined` (all versions) so the
 *   homepage/search never render empty while the catalog is 3.x-only.
 * - An explicit cookie (2.x/3.x/4.x/All): honored strictly and exactly, even
 *   if that major currently has no assets.
 */
export async function resolveBrowsingMajor (
  rawCookie: unknown
): Promise<number | undefined> {
  if (rawCookie === undefined) {
    const available = await getPublicMajorAvailability()
    return available.has(4) ? 4 : undefined
  }

  const preference = normalizeGodotVersionPreference(rawCookie)
  if (preference === 'all') return undefined
  return Number(preference)
}
