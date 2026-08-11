import { isSafeHttpUrl } from './safeUrl'

/**
 * Enrich grid-card asset objects before render:
 * - download_url: blanked unless it is a safe http(s) URL (mirrors the asset page)
 *
 * Call this on every asset array that will be rendered through
 * `asset-card.eta` so the template never sees untrusted URLs.
 */
export function attachCardExtras (assets: Array<Record<string, any>>): void {
  for (const asset of assets) {
    if (!isSafeHttpUrl(asset.download_url)) asset.download_url = ''
  }
}
