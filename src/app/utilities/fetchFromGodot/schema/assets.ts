export interface assetSchema {
  'asset_id': string
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
}
