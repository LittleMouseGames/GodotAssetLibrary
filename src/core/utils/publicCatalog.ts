/**
 * MongoDB predicate for assets that should be publicly discoverable and
 * indexable. This is the single source of truth used by search results and
 * counts, facets, homepage sections, related assets, the sitemap and the
 * detail-page robots policy so they always agree.
 *
 * Mirrors the previous sitemap-only exclusions:
 * - `source_status === 'unavailable'` assets are tombstones for assets removed
 *   upstream and must never surface in discovery or receive internal links.
 * - `searchable === 'false'` assets were excluded by the upstream catalog and
 *   should not be advertised.
 */
export const PUBLIC_ASSET_FILTER: Record<string, unknown> = {
  source_status: { $ne: 'unavailable' },
  searchable: { $ne: 'false' }
}
