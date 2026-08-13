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
