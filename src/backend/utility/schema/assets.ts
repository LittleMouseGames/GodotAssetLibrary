export interface assetSchema {
  'asset_id': string
  'legacy_asset_id': string
  'type': string
  'title': string
  'author': string
  'author_id': string
  'version': string
  'version_string': string
  'category': string
  'category_id': string
  'godot_version': string
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
  'download_url': string
  'upvotes': number
  'downvotes': number
  'featured': boolean
  'banner_url': String
  'previews': Array<[
    {
      'preview_id': string
      'type': string
      'link': string
      'thumbnail': string
    }
  ]>
}
