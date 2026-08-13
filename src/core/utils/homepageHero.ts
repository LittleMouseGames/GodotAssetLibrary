/**
 * Pure helpers for the curated homepage hero carousel.
 *
 * The hero is driven by an ADMIN-ORDERED list of canonical project (group)
 * ids, stored in the existing `info` document as `featured_assets`. These
 * helpers canonicalize whatever ids are configured (legacy variant ids,
 * sibling ids, etc.) to their group root, resolve each project to the best
 * public display variant for the active Godot major, and produce a
 * render-ready DTO for the hero partial. All functions are pure so they can
 * be unit-tested without a database.
 */

import { normalizePreviews } from './mediaHelpers'

/** Maximum number of slides the homepage hero renders. */
export const HERO_MAX_SLIDES = 8

/**
 * Render-ready slide for the homepage hero partial. Everything the template
 * needs (including artwork, badges, rating and price) is precomputed so the
 * partial stays declarative and does no data munging itself.
 */
export interface HomepageHeroAsset {
  /** Canonical project (group) id used for the asset URL. */
  groupId: string
  /** The id exactly as configured by the admin (kept for diagnostics). */
  configuredId: string
  /** Title of the version-compatible display variant. */
  title: string
  /** Title of the globally preferred variant — used for the canonical slug. */
  canonicalTitle: string
  author: string
  description: string
  category: string
  godotVersion: string
  /** Source provider of the display variant: 'godot_store' | 'godot_asset_library'. */
  provider?: string
  /** Original (non-proxied) artwork URL; the template applies the proxy. */
  image: string
  /** Original URL to fall back to when the proxied image fails to load. */
  fallbackImage: string
  storeUrl?: string
  priceCent?: number
  isFree?: boolean
  cost?: string
  licenseType?: string
  /** Local approval percentage (0-100) when there are local ratings. */
  ratingApproval?: number
  /** Total local ratings (upvotes + downvotes) when non-zero. */
  ratingTotal?: number
  /** Upstream Godot Asset Store net-vote score when the variant is a Store asset. */
  storeScore?: number
  versionString?: string
}

/** One canonical, deduplicated project reference in curator order. */
export interface CuratedProjectRef {
  configuredId: string
  groupId: string
}

export interface CuratedProjectResolution {
  refs: CuratedProjectRef[]
  /** Configured ids that resolved to no asset document. */
  missingIds: string[]
}

/** Admin row for the Homepage Hero management screen. */
export interface FeaturedAdminRow {
  groupId: string
  configuredId: string
  assetId: string
  title: string
  author: string
  provider?: string
  image: string
  isPublic: boolean
  isMissing: boolean
}

/** Hosts whose pages can never render as an <img> (YouTube watch/embed/shorts). */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'www.youtube-nocookie.com'
])

/** Raw video file extensions that cannot render as an <img>. */
const VIDEO_FILE_PATTERN = /\.(?:mp4|webm|mov|ogg|m4v|m3u8)(?:[?#]|$)/i

function isUsableHeroImage (url: unknown): url is string {
  if (typeof url !== 'string' || url.trim() === '') return false
  try {
    if (YOUTUBE_HOSTS.has(new URL(url).hostname.toLowerCase())) return false
  } catch {
    return false
  }
  return !VIDEO_FILE_PATTERN.test(url)
}

/**
 * Collect the unique canonical group ids from a set of seed documents (docs
 * matched by a configured id). A configured id may be a VARIANT id rather
 * than the group root, so callers use this to expand their fetch to every
 * variant of each discovered group — otherwise a pinned-major fallback to an
 * eligible sibling/root would silently not work for old/legacy curation. An
 * empty-string group id is treated as absent so the asset id is used.
 */
export function collectGroupIds (
  seedDocs: Array<{ asset_id?: string, group_id?: string }>
): string[] {
  const ids = new Set<string>()
  for (const doc of seedDocs) {
    const groupId = doc?.group_id
    const assetId = doc?.asset_id
    const id = typeof groupId === 'string' && groupId.trim() !== ''
      ? groupId
      : (typeof assetId === 'string' ? assetId : '')
    if (id.trim() !== '') ids.add(id)
  }
  return [...ids]
}

/**
 * Canonicalize a configured list of project ids to their group roots,
 * preserving first-seen order and dropping duplicates. Configured ids that
 * resolve to no asset document are reported separately so callers can surface
 * them instead of silently losing curation.
 */
export function resolveCuratedProjects (
  configuredIds: string[],
  assets: Array<Record<string, any>>
): CuratedProjectResolution {
  const refs: CuratedProjectRef[] = []
  const missingIds: string[] = []
  const seen = new Set<string>()

  for (const configuredId of configuredIds) {
    const raw = String(configuredId ?? '').trim()
    if (raw === '') continue
    const doc = assets.find(asset =>
      String(asset?.asset_id) === raw || String(asset?.group_id) === raw
    )
    if (doc === undefined) {
      missingIds.push(raw)
      continue
    }
    const groupId = String(doc.group_id ?? doc.asset_id ?? raw)
    if (groupId === '' || seen.has(groupId)) continue
    seen.add(groupId)
    refs.push({ configuredId: raw, groupId })
  }

  return { refs, missingIds }
}

/**
 * Deterministic tie-breaker for display-variant selection: prefer the Store
 * source (store-first presentation), then the lexicographically lowest id.
 */
function byProviderAndId (a: Record<string, any>, b: Record<string, any>): number {
  const providerA = a?.provider === 'godot_store' ? 0 : 1
  const providerB = b?.provider === 'godot_store' ? 0 : 1
  if (providerA !== providerB) return providerA - providerB
  return String(a?.asset_id ?? '').localeCompare(String(b?.asset_id ?? ''))
}

/** Pick the original artwork URL for a hero slide, with a safe fallback chain. */
export function selectHeroImage (asset: Record<string, any>): string {
  // 1. A valid, non-video card banner.
  if (isUsableHeroImage(asset?.card_banner)) return asset.card_banner
  // 2. The first normalized image preview.
  const previews = normalizePreviews(asset?.previews)
  const image = previews.find(item => item.type === 'image')
  if (image !== undefined && isUsableHeroImage(image.url)) return image.url
  // 3. The first normalized video poster (never the video page itself).
  const video = previews.find(item => item.type === 'video')
  if (video !== undefined && isUsableHeroImage(video.poster)) return video.poster
  // 4. The icon.
  if (isUsableHeroImage(asset?.icon_url)) return asset.icon_url
  // 5. Site placeholder.
  return '/images/noimage.png'
}

/**
 * Resolve a curated project list into render-ready hero slides in curator
 * order, capped at HERO_MAX_SLIDES.
 *
 * For each canonical group we select the display variant in this order:
 *   1. public records only (is_public === true);
 *   2. when a Godot major is pinned, only records whose scalar godot_major
 *      matches (identical to the rest of homepage/search discovery);
 *   3. the group_preferred variant;
 *   4. the group root;
 *   5. a deterministic provider/id tie-break.
 *
 * The canonical URL slug comes from the globally preferred public variant's
 * title (stable regardless of the pinned major), while title/description/
 * media come from the version-compatible display variant.
 */
export function resolveCuratedHeroAssets (
  configuredIds: string[],
  assets: Array<Record<string, any>>,
  major?: number
): HomepageHeroAsset[] {
  const { refs } = resolveCuratedProjects(configuredIds, assets)

  const byGroup = new Map<string, Array<Record<string, any>>>()
  for (const asset of assets) {
    const key = String(asset?.group_id ?? asset?.asset_id ?? '')
    if (key === '') continue
    const bucket = byGroup.get(key)
    if (bucket === undefined) byGroup.set(key, [asset])
    else bucket.push(asset)
  }

  const slides: HomepageHeroAsset[] = []
  for (const ref of refs) {
    if (slides.length >= HERO_MAX_SLIDES) break
    const variants = byGroup.get(ref.groupId) ?? []
    const eligible = variants.filter(asset =>
      asset?.is_public === true &&
      (major === undefined || Number(asset?.godot_major) === major)
    )
    if (eligible.length === 0) continue

    const display = eligible.find(asset => asset.group_preferred === true) ??
      eligible.find(asset => asset.is_group_root === true) ??
      eligible.slice().sort(byProviderAndId)[0]

    const publicVariants = variants.filter(asset => asset?.is_public === true)
    const preferred = publicVariants.find(asset => asset.group_preferred === true)
    const root = publicVariants.find(asset => asset.is_group_root === true)
    const canonicalTitle = preferred?.title ?? root?.title ?? display?.title ?? 'Untitled'

    const upvotesRaw = Number(display?.upvotes)
    const downvotesRaw = Number(display?.downvotes)
    const upvotes = Number.isFinite(upvotesRaw) ? upvotesRaw : 0
    const downvotes = Number.isFinite(downvotesRaw) ? downvotesRaw : 0
    const total = upvotes + downvotes
    const storeScore = display?.provider === 'godot_store' && display?.source_rating?.score != null
      ? Number(display.source_rating.score)
      : null

    const image = selectHeroImage(display ?? {})

    slides.push({
      groupId: ref.groupId,
      configuredId: ref.configuredId,
      title: display?.title ?? 'Untitled',
      canonicalTitle,
      author: display?.author ?? '',
      description: display?.quick_description ?? '',
      category: display?.category ?? display?.category_lowercase ?? '',
      godotVersion: display?.compatibility_label ?? display?.godot_version ?? '',
      provider: display?.provider,
      image,
      fallbackImage: image,
      storeUrl: display?.store_url,
      priceCent: display?.price_cent,
      isFree: display?.is_free === true,
      cost: display?.cost,
      licenseType: display?.license_type,
      ratingApproval: total > 0 ? Math.round((upvotes / total) * 100) : undefined,
      ratingTotal: total > 0 ? total : undefined,
      storeScore: storeScore ?? undefined,
      versionString: display?.version_string
    })
  }

  return slides
}

/**
 * Resolve curated project ids into ordered admin rows for the Homepage Hero
 * management screen. Preserves curator order, marks unresolved ids as missing
 * (so an admin can remove them), and deduplicates projects that resolve to the
 * same group (keeping the first occurrence).
 */
export function resolveFeaturedAdminRows (
  configuredIds: string[],
  assets: Array<Record<string, any>>
): FeaturedAdminRow[] {
  const rows: FeaturedAdminRow[] = []
  const seen = new Set<string>()

  for (const configuredId of configuredIds) {
    const raw = String(configuredId ?? '').trim()
    if (raw === '') continue
    const doc = assets.find(asset =>
      String(asset?.asset_id) === raw || String(asset?.group_id) === raw
    )
    if (doc === undefined) {
      rows.push({
        configuredId: raw,
        groupId: raw,
        assetId: '',
        title: 'Missing project',
        author: '',
        image: '/images/noimage.png',
        isPublic: false,
        isMissing: true
      })
      continue
    }

    const groupId = String(doc.group_id ?? doc.asset_id ?? raw)
    if (seen.has(groupId)) continue
    seen.add(groupId)

    const variants = assets.filter(asset => String(asset?.group_id ?? asset?.asset_id ?? '') === groupId)
    const display = variants.find(asset => asset?.is_public === true && asset.group_preferred === true) ??
      variants.find(asset => asset?.is_public === true) ??
      variants[0]
    const isPublic = variants.some(asset => asset?.is_public === true)

    rows.push({
      configuredId: raw,
      groupId,
      assetId: display?.asset_id ?? '',
      title: display?.title ?? 'Untitled',
      author: display?.author ?? '',
      provider: display?.provider,
      image: selectHeroImage(display ?? {}),
      isPublic,
      isMissing: false
    })
  }

  return rows
}
