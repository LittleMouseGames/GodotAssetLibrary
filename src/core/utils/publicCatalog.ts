/**
 * MongoDB predicate for assets that should be publicly discoverable and
 * indexable. This is the single source of truth used by search results and
 * counts, facets, homepage sections, related assets, the sitemap and the
 * detail-page robots policy so they always agree.
 *
 * Uses the denormalized `is_public` boolean (equality) instead of negative
 * `$ne` predicates so discovery queries can use normal/partial index
 * semantics. The flag is derived from the legacy predicate — an asset is
 * public when `source_status !== 'unavailable'` (upstream tombstones) AND
 * `searchable !== 'false'` (excluded by the upstream catalog). Migration
 * `0006` backfills existing documents and the importer keeps it current.
 */
export const PUBLIC_ASSET_FILTER: Record<string, unknown> = {
  is_public: true
}

/**
 * Unified-discovery predicate: the public filter PLUS the group-preferred
 * constraint. When no source filter is selected, exactly one variant per
 * linked project is surfaced (store-first by default), so a project listed in
 * both the legacy library and the Store appears once. When a specific source
 * IS selected the caller uses `PUBLIC_ASSET_FILTER` + `{ provider }` instead
 * (each project has at most one variant per provider, so no dedupe needed).
 */
export const UNIFIED_DISCOVERY_FILTER: Record<string, unknown> = {
  is_public: true,
  group_preferred: true
}

/** True when a discovery request has no source dimension selected. */
export function isUnifiedDiscovery (source: string | undefined): boolean {
  return source === undefined || source === ''
}
