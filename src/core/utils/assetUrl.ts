/** Slugify a title for the pretty asset URL path (alphanumeric + hyphens). */
function slugify (title: string): string {
  return String(title ?? '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLocaleLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Canonical asset page URL, e.g. /asset/abc123/my-cool-shader. */
export function buildAssetUrl (assetId: string, title: string): string {
  const slug = slugify(title)
  return `/asset/${assetId}${slug !== '' ? `/${slug}` : ''}`
}

/**
 * Asset page URL that remembers the discovery context so "Back to results"
 * restores filters, sorting, page and scroll position (via the card anchor).
 */
export function buildAssetUrlWithReturn (assetId: string, title: string, sourceUrl?: string): string {
  const url = buildAssetUrl(assetId, title)
  if (sourceUrl === undefined || sourceUrl === '') return url
  return `${url}?from=${encodeURIComponent(sourceUrl)}`
}

/** Stable anchor used on each card for scroll restoration on return. */
export function buildCardAnchor (assetId: string): string {
  return `asset-${assetId}`
}
