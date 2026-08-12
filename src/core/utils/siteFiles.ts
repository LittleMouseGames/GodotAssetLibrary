import { GetSiteFiles } from 'app/code/admin/models/GET/GetSiteFiles'

/**
 * Admin-managed plain-text files served at the domain root. Admins configure
 * an arbitrary route (e.g. `ads.txt`, `.well-known/security.txt`) plus its
 * content from /admin; each is stored in the `info` collection as
 * `{ type: 'site_file', route, content }`. The cache maps route -> content so
 * the public routes can serve any configured path without a hardcoded list.
 *
 * Cluster note: every worker process keeps its own copy of this cache, so
 * consistency is coordinated two ways — reads await an in-flight refresh so
 * the first request after a change serves fresh data, and an admin save
 * broadcasts a cluster message (via the primary) so ALL workers invalidate
 * immediately, not just the one that handled the request.
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
 * Start (or join) a refresh of the whole set. Deduplicated so concurrent
 * callers share one in-flight load; failures keep serving the last good value.
 */
async function refresh (): Promise<void> {
  if (refreshPromise === null) {
    refreshPromise = loadSiteFiles()
      .catch(() => {
        // Keep serving the stale value when the database is temporarily unavailable.
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  await refreshPromise
}

/**
 * Returns the content for a route, or `null` when no such file is configured.
 * When the cache is stale (or a refresh is already in flight) the caller waits
 * for fresh data, so the first request after a change or a restart never
 * serves a stale value or a bogus 404.
 */
export async function getSiteFileContent (route: string): Promise<string | null> {
  const now = Date.now()
  if (cacheExpiresAt <= now || refreshPromise !== null) {
    cacheExpiresAt = now + TTL_MS
    await refresh()
  }
  return cache.get(route) ?? null
}

/**
 * Invalidate this worker's cache and reload immediately.
 */
function invalidateLocal (): void {
  cacheExpiresAt = 0
  void refresh()
}

/**
 * Expire the cache and reload immediately, and broadcast the invalidation to
 * every worker (via the primary) so an admin save on one worker is reflected
 * on all of them. Called after an admin saves the Site Settings form.
 */
export function invalidateSiteFileCache (): void {
  invalidateLocal()
  // In cluster mode this runs in a worker, which can message the primary; the
  // primary relays the invalidation to every worker (see start.ts).
  if (typeof process.send === 'function') {
    process.send({ type: 'invalidate-site-files' })
  }
}

/**
 * Local-only invalidation for when this worker receives a broadcast from the
 * primary (i.e. another worker saved a site file). Does NOT re-broadcast,
 * otherwise the primary relay would loop forever.
 */
export function invalidateSiteFileCacheLocally (): void {
  invalidateLocal()
}

/**
 * Warm the cache in the background (e.g. once a worker has connected to Mongo
 * at startup) so the first public request serves immediately.
 */
export function primeSiteFilesCache (): void {
  void refresh()
}
