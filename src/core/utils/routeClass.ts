/**
 * Bounded route taxonomy for telemetry.
 *
 * Raw URLs, query strings and asset IDs are high-cardinality and are never
 * recorded; every request is bucketed into one of these fixed classes so
 * origin capacity questions ("is it crawlers hitting /search/, or bots
 * hammering PDPs?") can be answered from /metrics without unbounded labels.
 */

export type RouteClass =
  | 'health'
  | 'homepage'
  | 'browse'
  | 'search'
  | 'asset'
  | 'guides'
  | 'account'
  | 'auth'
  | 'admin'
  | 'mutation'
  | 'other'

export const ROUTE_CLASSES: RouteClass[] = [
  'health',
  'homepage',
  'browse',
  'search',
  'asset',
  'guides',
  'account',
  'auth',
  'admin',
  'mutation',
  'other'
]

/** True when the `q` query parameter carries a non-empty text search. */
function hasSearchQuery (query: Record<string, unknown>): boolean {
  const raw = query.q
  if (Array.isArray(raw)) {
    return raw.some(value => String(value ?? '').trim() !== '')
  }
  return String(raw ?? '').trim() !== ''
}

/**
 * Classify a request into a fixed, bounded route class for telemetry.
 * State-changing methods are always `mutation`; everything else is bucketed by
 * path (canonical browse vs text search is decided by the presence of `q`).
 */
export function classifyRouteClass (
  method: string,
  path: string,
  query: Record<string, unknown> = {}
): RouteClass {
  if (method !== 'GET' && method !== 'HEAD') return 'mutation'
  if (path === '/health') return 'health'
  if (path === '/') return 'homepage'
  if (path.startsWith('/asset/')) return 'asset'
  if (path === '/guides' || path.startsWith('/guides/')) return 'guides'
  if (path.startsWith('/category/') || path.startsWith('/engine/')) return 'browse'
  if (path.startsWith('/search')) return hasSearchQuery(query) ? 'search' : 'browse'
  if (path.startsWith('/api/')) return 'auth'
  if (path.startsWith('/dashboard') || path.startsWith('/register')) return 'account'
  if (path.startsWith('/admin')) return 'admin'
  return 'other'
}
