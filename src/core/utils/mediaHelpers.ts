export interface AssetPreview {
  type?: string
  link?: string
  thumbnail?: string
}

export interface MediaItem {
  type: 'image' | 'video'
  url: string
  thumbnail: string
  embedUrl?: string
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

/** Returns a safe embeddable YouTube URL, or null for non-YouTube media. */
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

    let videoId: string | null = null

    if (host.endsWith('youtu.be')) {
      videoId = getVideoId(parsed.pathname.split('/').filter(Boolean)[0] ?? null)
    } else if (parsed.pathname.startsWith('/watch')) {
      videoId = getVideoId(parsed.searchParams.get('v'))
    } else if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) {
      videoId = getVideoId(parsed.pathname.split('/').filter(Boolean)[1] ?? null)
    }

    return videoId === null ? null : `https://www.youtube.com/embed/${videoId}${getStartTime(parsed.searchParams.get('t') ?? parsed.searchParams.get('start'))}`
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
    const embedUrl = parseYoutubeUrl(url)
    const thumbnail = typeof preview.thumbnail === 'string' && preview.thumbnail.trim() !== ''
      ? preview.thumbnail.trim()
      : url

    items.push(embedUrl === null
      ? { type: 'image', url, thumbnail }
      : { type: 'video', url, thumbnail, embedUrl })

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
