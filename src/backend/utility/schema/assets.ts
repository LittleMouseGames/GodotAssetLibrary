export interface assetSchema {
  'asset_id': String
  'legacy_asset_id': String
  'type': String
  'title': String
  'author': String
  'author_id': String
  'version': String
  'version_string': String
  'category': String
  'category_id': String
  'godot_version': String
  'rating': String
  'cost': String
  'description': String
  'support_level': String
  'download_provider': String
  'download_commit': String
  'download_hash': String
  'browse_url': String
  'issues_url': String
  'icon_url': String
  'searchable': String
  'modify_date': String
  'download_url': String
  'previews': Array<[
    {
      'preview_id': String
      'type': String
      'link': String
      'thumbnail': String
    }
  ]>
}
