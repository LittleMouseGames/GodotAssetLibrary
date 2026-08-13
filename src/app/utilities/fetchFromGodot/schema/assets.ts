/** Source-provider identity for a catalog record. */
export type AssetProvider = 'godot_asset_library' | 'godot_store'

export interface assetSchema {
  'asset_id': string
  /** Internal six-character public ID; for linked projects this is the canonical group root. */
  'group_id'?: string
  /** True for the one record per group surfaced in unified discovery (store-first for linked projects). */
  'group_preferred'?: boolean
  /** True for the record whose `group_id === asset_id` (the canonical project URL holder). */
  'is_group_root'?: boolean
  /** Source provider. Backfilled to 'godot_asset_library' for existing records. */
  'provider'?: AssetProvider
  /** Provider-scoped identity: legacy id, or `<publisher_slug>/<asset_slug>` for Store. */
  'source_asset_id'?: string
  'legacy_asset_id': string
  'type': string
  'title': string
  'author': string
  'author_lowercase': string
  'author_id': string
  'version': string
  'version_string': string
  'category': string
  'category_lowercase': string
  'category_id': string
  'godot_version': string
  /** Normalized numeric major line (e.g. 4 for "4.2"); absent when unparseable. */
  'godot_major'?: number
  /** All supported major lines (Store releases can span ranges); legacy backfilled to [godot_major]. */
  'godot_majors'?: number[]
  'rating': string
  'cost': string
  'description': string
  'quick_description': string
  'support_level': string
  'download_provider': string
  'download_commit': string
  'download_hash': string
  'browse_url': string
  'issues_url': string
  'icon_url': string
  'searchable': string
  /** Denormalized public-catalog flag: `source_status !== 'unavailable' && searchable !== 'false'`. */
  'is_public'?: boolean
  'modify_date': string
  'added_date': Date
  'download_url': string
  'upvotes': number
  'downvotes': number
  /** Confidence-adjusted approval score (95% Wilson lower bound). */
  'rating_score'?: number
  'featured': boolean
  'card_banner': string
  'modify_date_pretty': string
  'previews': Array<{
    'preview_id': string
    'type': string
    'link': string
    'thumbnail': string
  }>
  'modify_date_at'?: Date
  'source_last_seen_at'?: Date
  'source_last_synced_at'?: Date
  'source_status'?: string
  'source_missing_runs'?: number
  'readme_status'?: string
  'readme_fetched_at'?: Date
  'readme_error'?: string

  // Godot Asset Store-only fields (absent on legacy records).
  'source_publisher_slug'?: string
  'source_asset_slug'?: string
  'source_type'?: number
  'store_url'?: string
  'donation_url'?: string
  'donation_text'?: string
  'license_type'?: string
  'license_url'?: string
  'price_cent'?: number
  'price_currency'?: string
  'is_free'?: boolean
  'source_featured'?: boolean
  'source_rating'?: { provider: string, score: number, kind: string, fetched_at: Date } | null
  'compatibility_label'?: string
  'compatibility_ranges'?: Array<{
    release_id: number
    min_version: string | null
    max_version: string | null
    min_version_key: number | null
    max_version_key: number | null
    stable: boolean
  }>
  'releases'?: Array<{
    release_id: number
    version: string
    stable: boolean
    size_mb: number | null
    created: string | null
    created_at: Date | null
    min_godot_version: string | null
    max_godot_version: string | null
    notes: string
  }>
  'body'?: { source_format: string, source_bbcode: string, sanitized_html: string }
  'publisher'?: {
    slug: string
    name: string
    thumbnail_url: string
    store_url: string
    verified: boolean
  }
  'tags'?: Array<{ slug: string, display_name: string, featured: boolean }>
  'tag_slugs'?: string[]
  'tag_names'?: string[]
  /** Link metadata when this Store record is grouped with a legacy record. */
  'link_info'?: {
    method: string
    confidence: number
    linked_at: Date
    linked_by: string
    evidence: { normalized_repository: string, legacy_title: string, store_title: string }
  }
  /** Normalized Git repository key (host/owner/repo) for strict duplicate linking. */
  'normalized_repository'?: string
  /** Linking state for Store records: none | linked | suggested | rejected. */
  'link_status'?: 'none' | 'linked' | 'suggested' | 'rejected'
  /** Admin-visible suggested legacy match (not auto-linked). */
  'link_suggestion'?: {
    legacy_asset_id: string
    normalized_repository: string
    legacy_title: string
    store_title: string
    confidence: number
  }
  /** Fingerprint of stable Store listing fields used for change detection. */
  'store_listing_fingerprint'?: string
}
