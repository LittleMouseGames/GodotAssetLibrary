/**
 * Store-specific URL handling.
 *
 * The Store API returns absolute URLs in most places but some thumbnail and
 * media fields are relative paths. Before persisting anything we resolve
 * relative values against the Store origin and validate the result, and we
 * restrict server-side-proxied media to known-safe origins so a malicious
 * imported media URL can never become an SSRF primitive through the image
 * proxy.
 */

import { isSafeHttpUrl } from './safeUrl'

export const STORE_ORIGIN = 'https://store.godotengine.org'

/** Hosts allowed for Store media that may be rendered via the image proxy. */
export const STORE_MEDIA_HOSTS = new Set([
  'store.godotengine.org',
  'asset-store-prod.fra1.digitaloceanspaces.com',
  'i.ytimg.com',
  'img.youtube.com'
])

/**
 * Resolve a possibly-relative Store URL to an absolute http(s) URL, or '' when
 * the value is not a usable URL. Relative values are resolved against the
 * Store origin. URL-credentials are rejected.
 */
export function resolveStoreUrl (value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '') return ''

  let resolved: string
  if (/^https?:\/\//i.test(trimmed)) {
    resolved = trimmed
  } else if (trimmed.startsWith('/')) {
    resolved = `${STORE_ORIGIN}${trimmed}`
  } else {
    return ''
  }

  if (!isSafeHttpUrl(resolved)) return ''

  try {
    const parsed = new URL(resolved)
    if (parsed.username !== '' || parsed.password !== '') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

/**
 * True when a media URL (thumbnail, icon, gallery image) comes from an
 * allowlisted host AND is a safe http(s) URL. Media outside the allowlist is
 * still persisted as a plain external link but must NOT be fed to the image
 * proxy / rendered as an <img>.
 */
export function isSafeStoreMediaUrl (value: unknown): boolean {
  const url = resolveStoreUrl(value)
  if (url === '') return false
  try {
    const parsed = new URL(url)
    return STORE_MEDIA_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * True when a Store media URL is safe to display inline (allowlisted host),
 * otherwise the caller should treat it as an external-link-only value.
 */
export function isDisplayableStoreMedia (value: unknown): boolean {
  return isSafeStoreMediaUrl(value)
}
