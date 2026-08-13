export interface assetGridSchema {
  category: string
  godot_version: string
  /** Normalized numeric major line (e.g. 4 for "4.2"). */
  godot_major?: number
  /** All supported major lines (Store assets can span ranges). */
  godot_majors?: number[]
  author: string
  title: string
  quick_description: string
  icon_url: string
  upvotes: number
  downvotes: number
  featured: boolean
  asset_id: string
  /** Canonical project id (root's asset_id) used for stable card links. */
  group_id?: string
  /** Source provider: 'godot_asset_library' | 'godot_store'. */
  provider?: string
  store_url?: string
  license_type?: string
  price_cent?: number
  is_free?: boolean
  source_rating?: { provider: string, score: number, kind: string } | null
  compatibility_label?: string
  previews: any[]
  modify_date: Date
}
