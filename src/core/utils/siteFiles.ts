import { GetSiteFiles } from 'app/code/admin/models/GET/GetSiteFiles'

/**
 * Admin-managed plain-text files served at the domain root. Admins configure
 * an arbitrary route (e.g. `ads.txt`, `.well-known/security.txt`) plus its
 * content from /admin; each is stored in the `info` collection as
 * `{ type: 'site_file', route, content }`. The cache maps route -> content so
 * the public routes can serve any configured path without a hardcoded list.
 */
const cache = new Map<string, string>()
let cacheExpiresAt = 0
let refreshPromise: Promise<void> | null = null
const TTL_MS = 60_000

/**
 * Load the whole set from the database. Kept async so any throw inside the
 * loader (e.g. MongoHelper.getDatabase() when no connection is established)
 * becomes a rejection handled by refresh() rather than bubbling synchronously
 * out of getSiteFileContent().
 */
async function loadSiteFiles (): Promise<void> {
  const files = await GetSiteFiles()
  cache.clear()
  for (const file of files) {
    cache.set(file.route, file.content)
  }
}

/**
 * Reload the whole set in the background (deduplicated so concurrent callers
 * share one in-flight refresh). Failures keep serving the last good value —
 * the routes must never error just because Mongo hiccupped. Mirrors
 * RouterServer's promobar refresh pattern.
 */
function refresh (): void {
  if (refreshPromise !== null) {
    return
  }

  refreshPromise = loadSiteFiles().catch(() => {
    // Keep serving the stale value when the database is temporarily unavailable.
  }).finally(() => {
    refreshPromise = null
  })
}

/**
 * Returns the content for a route (cached for TTL_MS) or `null` when no such
 * file is configured. When the cache is stale, kicks off a background refresh
 * so the next call within the TTL serves fresh content; the caller gets the
 * last known value synchronously, so the route never blocks on the database.
 */
export function getSiteFileContent (route: string): string | null {
  const now = Date.now()
  if (cacheExpiresAt <= now) {
    cacheExpiresAt = now + TTL_MS
    refresh()
  }
  return cache.get(route) ?? null
}

/**
 * Expire the cache so the next getSiteFileContent() re-reads from the
 * database. Called after an admin saves the Site Settings form so the public
 * routes reflect the change without waiting out the TTL.
 */
export function invalidateSiteFileCache (): void {
  cacheExpiresAt = 0
  // Kick off a background refresh right away (rather than waiting for the next
  // public request) so the new content is ready by the time the routes serve
  // it. Called after an admin saves the Site Settings form.
  refresh()
}
