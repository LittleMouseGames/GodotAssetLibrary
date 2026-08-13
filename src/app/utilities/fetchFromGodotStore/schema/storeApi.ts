/**
 * Godot Asset Store public API types (`https://store.godotengine.org/api/v1`).
 *
 * These mirror the live API responses as observed on 2026-08-13. The OpenAPI
 * document (v1.0.0) has several inaccuracies (e.g. ReleaseData.size declared
 * as boolean but returned as a number), so every field is treated as optional
 * and validated at runtime before persistence.
 */

export interface StorePublisherData {
  slug?: string
  name?: string
  thumbnail?: string | null
  store_url?: string | null
  verified?: boolean
}

export interface StoreTagData {
  slug?: string
  display_name?: string
  featured?: boolean
}

export interface StoreAssetData {
  slug?: string
  publisher?: StorePublisherData
  name?: string
  /** 0 = addon (tools/assets), 1 = full project (templates/demos); more may be added. */
  type?: number
  description?: string
  /** Price in Euro cents; 0 while the Store only permits free assets. */
  price_cent?: number
  license_type?: string
  license_url?: string | null
  thumbnail?: string | null
  /** Net signed vote score (upvotes - downvotes), not a review count. */
  reviews_score?: number
  tags?: StoreTagData[]
  store_url?: string | null
}

export interface StoreAssetDataDetailed extends StoreAssetData {
  body_html?: string
  body_bbcode?: string
  donation_text?: string
  donation_url?: string
  /** External source-code URL (e.g. GitHub/Codeberg). */
  source?: string
  featured_thumbnail?: string | null
  media?: string[]
  video_id?: string
  video_playback_url?: string
  video_embed_url?: string
  video_thumbnail_url?: string | null
  created?: string
  last_updated?: string
  featured?: boolean
}

export interface StoreReleaseData {
  /** Numeric release identity (immutable; `version` is NOT unique). */
  id?: number
  version?: string
  stable?: boolean
  /** Numeric size in MB despite the OpenAPI's incorrect boolean type. */
  size?: number | boolean | null
  created?: string
  min_godot_version?: string | null
  max_godot_version?: string | null
  notes?: string
  changes_html?: string
  changes_bbcode?: string
  /** Ephemeral signed URL (X-Amz-Expires ~600s). MUST NEVER be persisted. */
  download_url?: string | null
}

export interface StorePaginationMetadata {
  total: number
  total_pages: number
  page: number
  next_page: number | null
  previous_page: number | null
}

export interface StoreAssetType {
  id: number
  text: string
}

export interface StoreLicenseSummary {
  type: string
  count: number
}
