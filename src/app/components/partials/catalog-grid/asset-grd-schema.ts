export interface assetGridSchema {
  category: string
  godot_version: string
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
}
