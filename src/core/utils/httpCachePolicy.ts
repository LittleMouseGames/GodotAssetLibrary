import { GODOT_VERSION_PREFERENCE_COOKIE } from 'core/utils/godotVersionPreference'

/**
 * Centralized HTTP cache-policy classification.
 *
 * Only anonymous, canonical, deterministic GET/HEAD responses are eligible for
 * shared (edge/CDN) caching. Everything personalized, cookie-varying, mutated,
 * or high-cardinality must never be stored by a shared cache. This module is a
 * pure classifier so the exact header matrix is unit-testable without Express.
 */

const AUTH_COOKIE = 'auth-token'
const MAX_CACHEABLE_PAGE = 1000
const PAGE_RE = /^\d{1,4}$/

export interface CachePolicy {
  /** Browser max-age in seconds. */
  browserMaxAge: number
  /** Shared (CDN/edge) max-age in seconds. */
  sharedMaxAge: number
  staleWhileRevalidate: number
  staleIfError: number
}

/**
 * Anonymous canonical public pages: short browser freshness so users see
 * changes quickly, a five-minute shared-cache lifetime for the edge, a
 * stale-while-revalidate window so the edge can serve slightly stale pages
 * while revalidating, and a 24-hour stale-if-error window so the site keeps
 * serving the last known good page even while the origin is down or broken.
 */
export const PUBLIC_CACHE_POLICY: CachePolicy = {
  browserMaxAge: 60,
  sharedMaxAge: 300,
  staleWhileRevalidate: 300,
  staleIfError: 86_400
}

export function buildPublicCacheControl (policy: CachePolicy = PUBLIC_CACHE_POLICY): string {
  return `public, max-age=${policy.browserMaxAge}, s-maxage=${policy.sharedMaxAge}, ` +
    `stale-while-revalidate=${policy.staleWhileRevalidate}, stale-if-error=${policy.staleIfError}`
}

export interface CacheRequestLike {
  method: string
  path: string
  query: Record<string, unknown>
  cookies?: Record<string, unknown>
}

/** Only a numeric, bounded `page` query parameter is accepted. */
function hasOnlyPageParam (query: Record<string, unknown>): boolean {
  const keys = Object.keys(query)
  if (keys.length === 0) return true
  if (keys.length !== 1 || keys[0] !== 'page') return false
  const raw = query.page
  if (Array.isArray(raw)) return false
  const value = String(raw ?? '')
  if (!PAGE_RE.test(value)) return false
  const page = Number.parseInt(value, 10)
  return page >= 1 && page <= MAX_CACHEABLE_PAGE
}

function hasNoQuery (query: Record<string, unknown>): boolean {
  return Object.keys(query).length === 0
}

/**
 * True when the request path+query resolves to one of the finite, canonical,
 * deterministic public views that a shared cache may store. Search queries,
 * filter combinations, review pagination, `from=` variants and any other
 * high-cardinality or request-specific variants return false.
 */
export function isPubliclyCacheablePath (
  method: string,
  path: string,
  query: Record<string, unknown>
): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false

  if (path === '/') return hasNoQuery(query)
  if (path === '/search/') return hasOnlyPageParam(query)
  if (/^\/category\/[^/]+$/.test(path)) return hasOnlyPageParam(query)
  if (/^\/engine\/[^/]+$/.test(path)) return hasOnlyPageParam(query)
  // Canonical asset detail page: only the anonymous first review page with no
  // request-specific params (no `from`, no `reviews_page`). End-anchored so
  // deeper non-canonical variants (which 301 to the canonical slug) are never
  // shared-cached.
  if (/^\/asset\/[^/]+\/[^/]+\/?$/.test(path)) return hasNoQuery(query)
  if (/^\/guides(?:\/[^/]+)?\/?$/.test(path)) return hasNoQuery(query)
  return false
}

/**
 * Decide the Cache-Control directive for a request, or null when the request
 * should be left alone (non-GET/HEAD). Never clobbers a header set by an
 * earlier middleware (callers must check that first).
 */
export function classifyCacheControl (req: CacheRequestLike): string | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null

  const cookies = req.cookies ?? {}
  const authToken = cookies[AUTH_COOKIE]
  const versionCookie = cookies[GODOT_VERSION_PREFERENCE_COOKIE]
  const hasVersionCookie = versionCookie !== undefined && versionCookie !== ''

  // Personalized/authenticated responses must never be shared-cached.
  if (authToken !== undefined && authToken !== '') {
    return 'private, no-store'
  }

  // Responses that vary by the Godot-version cookie stay browser-only.
  if (hasVersionCookie) {
    return 'private, max-age=120'
  }

  // Anonymous canonical views get the aggressive shared policy; every other
  // anonymous GET is browser-cacheable but not shared-cacheable.
  if (isPubliclyCacheablePath(req.method, req.path, req.query)) {
    return buildPublicCacheControl()
  }
  return 'private, max-age=120'
}
