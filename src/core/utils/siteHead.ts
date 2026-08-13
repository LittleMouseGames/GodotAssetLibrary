import { GetSiteHead } from 'app/code/admin/models/GET/GetSiteHead'

/**
 * Admin-managed HTML fragment injected into the <head> of every page.
 * Admins configure arbitrary markup (extra meta tags, analytics scripts,
 * schema.org JSON-LD) from /admin; it is stored in the `info` collection as
 * `{ type: 'site_head', content }`. The cache maps to that single content
 * string so head.eta can render it on every page without a database hit.
 *
 * Cluster note: every worker process keeps its own copy of this cache, so
 * consistency is coordinated two ways — reads await an in-flight refresh so
 * the first request after a change serves fresh data, and an admin save
 * broadcasts a cluster message (via the primary) so ALL workers invalidate
 * immediately, not just the one that handled the request.
 */
let cachedContent = ''
let cacheExpiresAt = 0
let refreshPromise: Promise<void> | null = null
const TTL_MS = 60_000

/**
 * Load the content from the database. Kept async so any throw inside the
 * loader (e.g. MongoHelper.getDatabase() when no connection is established)
 * becomes a rejection handled by refresh() rather than bubbling synchronously
 * out of getSiteHead().
 */
async function loadSiteHead (): Promise<void> {
  cachedContent = await GetSiteHead()
}

/**
 * Start (or join) a refresh of the content. Deduplicated so concurrent
 * callers share one in-flight load; failures keep serving the last good value.
 */
async function refresh (): Promise<void> {
  if (refreshPromise === null) {
    refreshPromise = loadSiteHead()
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
 * Returns the HTML fragment to inject into the <head>, or an empty string when
 * nothing is configured. When the cache is stale (or a refresh is already in
 * flight) the caller waits for fresh data, so the first request after a change
 * or a restart never serves stale markup.
 */
export async function getSiteHead (): Promise<string> {
  const now = Date.now()
  if (cacheExpiresAt <= now || refreshPromise !== null) {
    cacheExpiresAt = now + TTL_MS
    await refresh()
  }
  return cachedContent
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
export function invalidateSiteHeadCache (): void {
  invalidateLocal()
  // In cluster mode this runs in a worker, which can message the primary; the
  // primary relays the invalidation to every worker (see start.ts).
  if (typeof process.send === 'function') {
    process.send({ type: 'invalidate-site-head' })
  }
}

/**
 * Local-only invalidation for when this worker receives a broadcast from the
 * primary (i.e. another worker saved a site head). Does NOT re-broadcast,
 * otherwise the primary relay would loop forever.
 */
export function invalidateSiteHeadCacheLocally (): void {
  invalidateLocal()
}

/**
 * Warm the cache in the background (e.g. once a worker has connected to Mongo
 * at startup) so the first public request serves immediately.
 */
export function primeSiteHeadCache (): void {
  void refresh()
}
