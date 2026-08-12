export interface assetGridSchema {
  category: string
  godot_version: string
  /** Normalized numeric major line (e.g. 4 for "4.2"). */
  godot_major?: number
  author: string
  title: string
  quick_description: string
  icon_url: string
  upvotes: number
  downvotes: number
  featured: boolean
  asset_id: string
  previews: any[]
  modify_date: Date
  added_date?: Date
  version_string?: string
  type?: string
  support_level?: string
  /** Optional human-readable context line such as "Updated 3 days ago". */
  context?: string
}
