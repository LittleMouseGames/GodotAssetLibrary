export interface AssetPreview {
  type?: string
  link?: string
  thumbnail?: string
}

export interface MediaItem {
  type: 'image' | 'video' | 'external'
  url: string
  thumbnail: string
  embedUrl?: string
  /** YouTube video ID (video items only), used to synthesize posters. */
  videoId?: string
  /** Reliable poster image for a video (upstream thumbnail or synthesized). */
  poster?: string
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'www.youtube-nocookie.com'
])

/** File extensions we can reliably render as an <img>. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'])

/** File extensions that are clearly video but not YouTube-embeddable. */
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'ogg', 'm4v', 'm3u8'])

function fileExtension (url: string): string {
  try {
    const pathname = new URL(url).pathname
    const lastSegment = pathname.split('/').filter(Boolean).pop() ?? ''
    return lastSegment.includes('.') ? (lastSegment.split('.').pop() ?? '').toLowerCase() : ''
  } catch {
    return ''
  }
}

function getVideoId (value: string | null): string | null {
  if (value === null || !/^[A-Za-z0-9_-]{6,20}$/.test(value)) {
    return null
  }

  return value
}

function getStartTime (value: string | null): string {
  if (value === null) {
    return ''
  }

  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Array.from(value.matchAll(/(\d+)(h|m|s)/g)).reduce((total, match) => {
      const amount = Number(match[1])
      return total + (match[2] === 'h' ? amount * 3600 : match[2] === 'm' ? amount * 60 : amount)
    }, 0)

  return Number.isSafeInteger(seconds) && seconds > 0 ? `?start=${seconds}` : ''
}

/** Extract a validated YouTube video ID from a parsed URL, or null. */
function extractYoutubeVideoId (parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase()

  if (host.endsWith('youtu.be')) {
    return getVideoId(parsed.pathname.split('/').filter(Boolean)[0] ?? null)
  }

  if (parsed.pathname.startsWith('/watch')) {
    return getVideoId(parsed.searchParams.get('v'))
  }

  // /embed/<id>, /shorts/<id>, /live/<id>, legacy /v/<id>
  const pathSegments = parsed.pathname.split('/').filter(Boolean)
  if (
    parsed.pathname.startsWith('/embed/') ||
    parsed.pathname.startsWith('/shorts/') ||
    parsed.pathname.startsWith('/live/') ||
    parsed.pathname.startsWith('/v/')
  ) {
    return getVideoId(pathSegments[1] ?? null)
  }

  return null
}

/**
 * Returns a safe embeddable YouTube URL (privacy-enhanced youtube-nocookie
 * domain), or null for non-YouTube media. `start` is preserved when present.
 */
export function parseYoutubeUrl (url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0) {
    return null
  }

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (!YOUTUBE_HOSTS.has(host)) {
      return null
    }

    const videoId = extractYoutubeVideoId(parsed)
    if (videoId === null) return null

    return `https://www.youtube-nocookie.com/embed/${videoId}${getStartTime(parsed.searchParams.get('t') ?? parsed.searchParams.get('start'))}`
  } catch (_error) {
    return null
  }
}

export function normalizePreviews (previews: unknown): MediaItem[] {
  if (!Array.isArray(previews)) {
    return []
  }

  return previews.reduce<MediaItem[]>((items, preview: AssetPreview) => {
    if (typeof preview?.link !== 'string' || preview.link.trim() === '') {
      return items
    }

    const url = preview.link.trim()

    // Only http(s) URLs are rendered; other schemes would break the media
    // markup or invite unsafe loads.
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return items
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return items
    }

    const embedUrl = parseYoutubeUrl(url)
    const extension = fileExtension(url)
    const upstreamThumbnail = typeof preview.thumbnail === 'string' && preview.thumbnail.trim() !== ''
      ? preview.thumbnail.trim()
      : ''

    if (embedUrl !== null) {
      // Videos always get a real poster image. When the upstream preview has
      // no thumbnail, synthesize one from the video ID (the YouTube page URL
      // itself would render as a broken image).
      let videoId: string | null = null
      try {
        const parsed = new URL(url)
        if (YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
          videoId = extractYoutubeVideoId(parsed)
        }
      } catch {
        // keep null
      }
      const poster = upstreamThumbnail !== ''
        ? upstreamThumbnail
        : (videoId !== null ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : url)
      items.push({ type: 'video', url, thumbnail: poster, embedUrl, videoId: videoId ?? undefined, poster })
    } else if (VIDEO_EXTENSIONS.has(extension)) {
      // Real video that we cannot embed — surface it as an external link rather
      // than pretending the URL is an image.
      items.push({ type: 'external', url, thumbnail: upstreamThumbnail !== '' ? upstreamThumbnail : url })
    } else if (IMAGE_EXTENSIONS.has(extension) || typeof preview.thumbnail === 'string') {
      items.push({ type: 'image', url, thumbnail: upstreamThumbnail !== '' ? upstreamThumbnail : url })
    } else {
      // Unknown type with no thumbnail would render as a broken image; keep it
      // accessible as an external link instead.
      items.push({ type: 'external', url, thumbnail: upstreamThumbnail !== '' ? upstreamThumbnail : url })
    }

    return items
  }, [])
}

export function getFallbackImage (asset: { card_banner?: unknown, icon_url?: unknown }): string {
  if (typeof asset.card_banner === 'string' && asset.card_banner.trim() !== '') {
    return asset.card_banner
  }

  if (typeof asset.icon_url === 'string' && asset.icon_url.trim() !== '') {
    return asset.icon_url
  }

  return '/images/noimage.png'
}
