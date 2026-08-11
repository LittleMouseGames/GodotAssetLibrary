/**
 * True only for http:// or https:// absolute URLs.
 *
 * Imported asset data is untrusted. This is the single guard used before any
 * external URL (download, repository, issues, media, icon) is rendered as an
 * href or src so non-HTTP schemes (javascript:, data:, file:, etc.) can never
 * reach the browser from imported content.
 */
export function isSafeHttpUrl (value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return false
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
