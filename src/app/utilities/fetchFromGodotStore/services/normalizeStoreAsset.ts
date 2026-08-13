/**
 * Pure normalization from raw Godot Asset Store API responses into the
 * application's shared asset document shape.
 *
 * Everything here is a deterministic pure function (no I/O, no Mongo) so it
 * can be unit-tested against fixtures. The importer job handles persistence,
 * source reconciliation and linking.
 *
 * Security rules enforced here:
 * - Every URL is resolved/validated; relative Store URLs are resolved against
 *   the Store origin; credentials are rejected.
 * - Store media is only kept as inline-displayable when it comes from an
 *   allowlisted host; anything else is dropped from the gallery.
 * - Body HTML is sanitized by `sanitizeStoreHtml`.
 * - Ephemeral signed `download_url` values are NEVER persisted.
 */

import { StoreAssetDataDetailed, StoreReleaseData, StoreTagData } from '../schema/storeApi'
import { buildCompatibilitySummary, normalizeGodotRanges, GodotReleaseRange, StoreReleaseInput } from 'core/utils/godotCompatibility'
import { resolveStoreUrl, isDisplayableStoreMedia } from 'core/utils/storeUrl'
import { sanitizeStoreHtml } from 'core/utils/storeBodyRenderer'
import { parseGodotMajor } from 'core/utils/godotVersionPreference'
import { mapStoreCategory } from './categoryMapping'
import { normalizeRepositoryUrl } from 'core/utils/repositoryNormalization'

export const STORE_PROVIDER = 'godot_store'
export const STORE_PROVIDER_LABEL = 'Godot Asset Store'

const MAX_TITLE = 200
const MAX_AUTHOR = 200
const MAX_SLUG = 128
const MAX_SUMMARY_BYTES = 4 * 1024
const MAX_DESCRIPTION_BYTES = 64 * 1024
const MAX_TAGS = 100
const MAX_TAG_NAME = 100
const MAX_MEDIA = 20
const MAX_RELEASES_EMBEDDED = 20
const MAX_RELEASE_NOTES_BYTES = 64 * 1024
const MAX_BODY_BYTES = 1024 * 1024

export interface StoreCompatibilityRangeRecord {
  release_id: number
  min_version: string | null
  max_version: string | null
  min_version_key: number | null
  max_version_key: number | null
  stable: boolean
}

export interface StoreReleaseSummaryRecord {
  release_id: number
  version: string
  stable: boolean
  size_mb: number | null
  created: string | null
  created_at: Date | null
  min_godot_version: string | null
  max_godot_version: string | null
  notes: string
}

export interface NormalizedStoreAsset {
  provider: typeof STORE_PROVIDER
  source_asset_id: string
  source_publisher_slug: string
  source_asset_slug: string
  title: string
  author: string
  author_lowercase: string
  author_id: string
  source_type: number | undefined
  type: string
  category: string
  category_lowercase: string
  description: string
  quick_description: string
  godot_version: string
  godot_major: number | undefined
  godot_majors: number[]
  compatibility_label: string
  compatibility_ranges: StoreCompatibilityRangeRecord[]
  version_string: string
  price_cent: number
  price_currency: string
  is_free: boolean
  cost: string
  license_type: string
  license_url: string
  source_rating: { provider: string, score: number, kind: string, fetched_at: Date } | null
  source_featured: boolean
  store_url: string
  donation_url: string
  donation_text: string
  browse_url: string
  normalized_repository: string
  icon_url: string
  card_banner: string
  previews: Array<{ preview_id: string, type: string, link: string, thumbnail: string }>
  body: { source_format: string, source_bbcode: string, sanitized_html: string }
  releases: StoreReleaseSummaryRecord[]
  added_date: Date
  modify_date: string
  modify_date_at: Date
  searchable: string
  publisher: { slug: string, name: string, thumbnail_url: string, store_url: string, verified: boolean }
  tags: StoreTagData[]
  tag_slugs: string[]
  tag_names: string[]
}

const clampLength = (value: unknown, max: number): string => {
  const str = typeof value === 'string' ? value.trim() : ''
  return str.length > max ? str.slice(0, max) : str
}

function cleanSummary (value: unknown): string {
  const str = typeof value === 'string' ? value.trim() : ''
  if (str === '') return ''
  return Buffer.byteLength(str, 'utf8') > MAX_SUMMARY_BYTES
    ? str.slice(0, MAX_SUMMARY_BYTES)
    : str
}

function parseUtcDate (value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const candidate = /(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim()) ? value.trim() : `${value.trim()}Z`
  const date = new Date(candidate)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatPrice (priceCent: number): string {
  return `\u20AC${(priceCent / 100).toFixed(2)}`
}

function safeTags (tags: unknown): StoreTagData[] {
  if (!Array.isArray(tags)) return []
  const result: StoreTagData[] = []
  for (const tag of tags) {
    if (tag == null || typeof tag !== 'object') continue
    const candidate = tag as StoreTagData
    const slug = clampLength(candidate.slug, MAX_TAG_NAME)
    const name = clampLength(candidate.display_name, MAX_TAG_NAME)
    if (slug === '' && name === '') continue
    result.push({ slug, display_name: name !== '' ? name : slug, featured: candidate.featured === true })
    if (result.length >= MAX_TAGS) break
  }
  return result
}

function mapMedia (detail: StoreAssetDataDetailed): Array<{ preview_id: string, type: string, link: string, thumbnail: string }> {
  const previews: Array<{ preview_id: string, type: string, link: string, thumbnail: string }> = []

  if (Array.isArray(detail.media)) {
    for (let index = 0; index < Math.min(detail.media.length, MAX_MEDIA); index++) {
      const raw = detail.media[index]
      if (typeof raw !== 'string') continue
      const url = resolveStoreUrl(raw)
      if (url === '') continue
      if (!isDisplayableStoreMedia(url)) continue
      previews.push({ preview_id: `store-image-${index}`, type: 'image', link: url, thumbnail: url })
    }
  }

  // Video preview: prefer a validated video_id; otherwise fall back to the
  // provided playback URL if it is a YouTube URL.
  const videoId = typeof detail.video_id === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(detail.video_id.trim())
    ? detail.video_id.trim()
    : null
  const videoThumbnail = isDisplayableStoreMedia(detail.video_thumbnail_url)
    ? resolveStoreUrl(detail.video_thumbnail_url)
    : ''
  if (videoId !== null) {
    previews.push({
      preview_id: 'store-video',
      type: 'video',
      link: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: videoThumbnail !== '' ? videoThumbnail : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    })
  } else if (typeof detail.video_playback_url === 'string' && detail.video_playback_url !== '') {
    const url = resolveStoreUrl(detail.video_playback_url)
    if (url !== '') {
      previews.push({ preview_id: 'store-video', type: 'video', link: url, thumbnail: videoThumbnail })
    }
  }

  return previews
}

function mapReleases (releases: StoreReleaseData[] | undefined): { ranges: GodotReleaseRange[], summaries: StoreReleaseSummaryRecord[], versionString: string } {
  const raw: StoreReleaseInput[] = Array.isArray(releases)
    ? releases.map(release => ({
      id: Number(release?.id),
      version: typeof release?.version === 'string' ? release.version.trim() : '',
      stable: release?.stable === true,
      min_godot_version: typeof release?.min_godot_version === 'string' && release.min_godot_version !== ''
        ? release.min_godot_version
        : null,
      max_godot_version: typeof release?.max_godot_version === 'string' && release.max_godot_version !== ''
        ? release.max_godot_version
        : null,
      created: typeof release?.created === 'string' ? release.created : null,
      size: typeof release?.size === 'number' && Number.isFinite(release.size) ? release.size : null,
      notes: typeof release?.notes === 'string' ? release.notes : ''
    }))
    : []

  const ranges = normalizeGodotRanges(raw)

  const summaries: StoreReleaseSummaryRecord[] = []
  const orderedRaw = [...raw].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
  for (const release of orderedRaw) {
    const id = Number(release.id)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    const size = typeof release.size === 'number' && Number.isFinite(release.size)
      ? Math.abs(release.size)
      : null
    const createdRaw = typeof release.created === 'string' ? release.created : null
    const createdAt = parseUtcDate(createdRaw)
    const notesRaw = typeof release.notes === 'string' ? release.notes : ''
    const notes = Buffer.byteLength(notesRaw, 'utf8') > MAX_RELEASE_NOTES_BYTES
      ? notesRaw.slice(0, MAX_RELEASE_NOTES_BYTES)
      : notesRaw
    summaries.push({
      release_id: id,
      version: release.version ?? '',
      stable: release.stable === true,
      size_mb: size,
      created: createdRaw,
      created_at: createdAt,
      min_godot_version: release.min_godot_version ?? null,
      max_godot_version: release.max_godot_version ?? null,
      notes
    })
    if (summaries.length >= MAX_RELEASES_EMBEDDED) break
  }

  const preferred = ranges.length > 0
    ? [...ranges].sort((a, b) => {
      if (a.stable !== b.stable) return a.stable ? -1 : 1
      const aTime = a.created_at?.getTime() ?? 0
      const bTime = b.created_at?.getTime() ?? 0
      if (aTime !== bTime) return bTime - aTime
      return b.release_id - a.release_id
    })[0] ?? null
    : null

  return {
    ranges,
    summaries,
    versionString: preferred !== null
      ? (summaries.find(s => s.release_id === preferred.release_id)?.version ?? '')
      : ''
  }
}

/**
 * Normalize a Store detail response (+ its releases) into the shared asset
 * document shape. The caller decides persistence/searchability.
 */
export function normalizeStoreAsset (
  detail: StoreAssetDataDetailed,
  releases: StoreReleaseData[] | undefined
): NormalizedStoreAsset | null {
  if (detail == null || typeof detail !== 'object') return null

  const publisherSlug = clampLength(detail.publisher?.slug, MAX_SLUG)
  const assetSlug = clampLength(detail.slug, MAX_SLUG)
  if (publisherSlug === '' || assetSlug === '') return null

  const title = clampLength(detail.name, MAX_TITLE)
  if (title === '') return null

  const publisherName = clampLength(detail.publisher?.name, MAX_AUTHOR)
  const author = publisherName !== '' ? publisherName : publisherSlug
  const type = Number(detail.type)
  const appType = type === 1 ? 'Project' : 'Addon'
  const category = mapStoreCategory(Number.isSafeInteger(type) ? type : undefined, safeTags(detail.tags))

  const description = (() => {
    const raw = typeof detail.description === 'string' ? detail.description.trim() : ''
    if (Buffer.byteLength(raw, 'utf8') > MAX_DESCRIPTION_BYTES) return raw.slice(0, MAX_DESCRIPTION_BYTES)
    return raw
  })()
  const quickDescription = cleanSummary(description).replace(/(\r\n|\n|\r|\t)+/g, ' ').trim()

  const { ranges, summaries, versionString } = mapReleases(releases)
  const summary = buildCompatibilitySummary(releases ?? [])
  const hasUsableRelease = ranges.length > 0

  const cardBanner = isDisplayableStoreMedia(detail.featured_thumbnail)
    ? resolveStoreUrl(detail.featured_thumbnail)
    : (isDisplayableStoreMedia(detail.thumbnail) ? resolveStoreUrl(detail.thumbnail) : '')
  const iconUrl = isDisplayableStoreMedia(detail.publisher?.thumbnail)
    ? resolveStoreUrl(detail.publisher?.thumbnail)
    : cardBanner

  const priceCent = Number.isSafeInteger(detail.price_cent) && (detail.price_cent ?? 0) >= 0
    ? (detail.price_cent as number)
    : 0

  const score = Number.isSafeInteger(detail.reviews_score) ? (detail.reviews_score as number) : 0

  const licenseUrl = resolveStoreUrl(detail.license_url)
  const storeUrl = resolveStoreUrl(detail.store_url)
  const browseUrl = resolveStoreUrl(detail.source)
  const donationUrl = resolveStoreUrl(detail.donation_url)
  const donationText = clampLength(detail.donation_text, 200)

  const addedDate = parseUtcDate(detail.created) ?? new Date()
  const modifyDateRaw = typeof detail.last_updated === 'string' ? detail.last_updated.trim() : ''
  const modifyDateAt = parseUtcDate(modifyDateRaw) ?? addedDate

  const tags = safeTags(detail.tags)
  const tagSlugs = tags.map(tag => tag.slug ?? '').filter(Boolean)
  const tagNames = tags.map(tag => tag.display_name ?? '').filter(Boolean)

  const bodyHtml = typeof detail.body_html === 'string' && detail.body_html !== ''
    ? (Buffer.byteLength(detail.body_html, 'utf8') > MAX_BODY_BYTES ? detail.body_html.slice(0, MAX_BODY_BYTES) : detail.body_html)
    : ''
  const bodyBbcode = typeof detail.body_bbcode === 'string' ? detail.body_bbcode : ''

  const previews = mapMedia(detail)

  return {
    provider: STORE_PROVIDER,
    source_asset_id: `${publisherSlug}/${assetSlug}`,
    source_publisher_slug: publisherSlug,
    source_asset_slug: assetSlug,
    title,
    author,
    author_lowercase: author.toLocaleLowerCase(),
    author_id: publisherSlug,
    source_type: Number.isSafeInteger(type) ? type : undefined,
    type: appType,
    category: category.category,
    category_lowercase: category.category_lowercase,
    description,
    quick_description: quickDescription,
    godot_version: summary.godot_version,
    godot_major: summary.godot_major ?? (summary.godot_version !== '' ? parseGodotMajor(summary.godot_version) : undefined),
    godot_majors: summary.godot_majors,
    compatibility_label: summary.compatibility_label,
    compatibility_ranges: ranges.map(range => ({
      release_id: range.release_id,
      min_version: range.min_version,
      max_version: range.max_version,
      min_version_key: range.min_version_key,
      max_version_key: range.max_version_key,
      stable: range.stable
    })),
    version_string: versionString,
    price_cent: priceCent,
    price_currency: 'EUR',
    is_free: priceCent === 0,
    cost: priceCent === 0 ? '0' : formatPrice(priceCent),
    license_type: clampLength(detail.license_type, 200),
    license_url: licenseUrl,
    source_rating: {
      provider: STORE_PROVIDER,
      score,
      kind: 'net_vote_score',
      fetched_at: new Date()
    },
    source_featured: detail.featured === true,
    store_url: storeUrl,
    donation_url: donationUrl,
    donation_text: donationText,
    browse_url: browseUrl,
    normalized_repository: normalizeRepositoryUrl(browseUrl) ?? '',
    icon_url: iconUrl,
    card_banner: cardBanner,
    previews,
    body: {
      source_format: 'bbcode',
      source_bbcode: bodyBbcode,
      sanitized_html: sanitizeStoreHtml(bodyHtml)
    },
    releases: summaries,
    added_date: addedDate,
    modify_date: modifyDateRaw,
    modify_date_at: modifyDateAt,
    // A Store record is only searchable when it has a usable release AND a
    // resolvable canonical Store page URL. Without a release there is nothing
    // to acquire; without a Store URL the record cannot point anywhere.
    searchable: hasUsableRelease && storeUrl !== '' ? 'true' : 'false',
    publisher: {
      slug: publisherSlug,
      name: author,
      thumbnail_url: iconUrl,
      store_url: storeUrl,
      verified: detail.publisher?.verified === true
    },
    tags,
    tag_slugs: tagSlugs,
    tag_names: tagNames
  }
}
