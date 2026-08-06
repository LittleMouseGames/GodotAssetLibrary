import DOMPurify from 'dompurify'
import { createHash } from 'crypto'
import { JSDOM } from 'jsdom'
import { marked, Renderer } from 'marked'

const window = new JSDOM('<!DOCTYPE html>').window
const purify = DOMPurify(window as unknown as Window)
const renderedReadmeCache = new Map<string, { html: string, bytes: number }>()
const MAX_CACHE_BYTES = 16 * 1024 * 1024
let cacheBytes = 0

interface ReadmeAsset {
  browse_url?: unknown
  icon_url?: unknown
}

function resolveBranch (iconUrl: unknown): string {
  return typeof iconUrl === 'string' && iconUrl.includes('/main/') ? 'main' : 'master'
}

function resolveImageUrl (href: string, browseUrl: unknown, branch: string): string {
  if (typeof browseUrl !== 'string' || /^https?:\/\//i.test(href)) {
    return href
  }

  if (browseUrl.includes('gitlab.com')) {
    return `${browseUrl}/-/raw/${branch}/${href}`
  }

  if (browseUrl.includes('github.com')) {
    return `${browseUrl}/raw/${branch}/${href}`
  }

  return href
}

function getCacheKey (readme: string, asset: ReadmeAsset): string {
  return createHash('sha256')
    .update(readme)
    .update('\0')
    .update(typeof asset.browse_url === 'string' ? asset.browse_url : '')
    .update('\0')
    .update(typeof asset.icon_url === 'string' ? asset.icon_url : '')
    .digest('base64')
}

function cacheRenderedReadme (key: string, html: string): void {
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > MAX_CACHE_BYTES) {
    return
  }

  while (cacheBytes + bytes > MAX_CACHE_BYTES && renderedReadmeCache.size > 0) {
    const oldestKey = renderedReadmeCache.keys().next().value as string
    const oldest = renderedReadmeCache.get(oldestKey)
    if (oldest !== undefined) {
      cacheBytes -= oldest.bytes
    }
    renderedReadmeCache.delete(oldestKey)
  }

  renderedReadmeCache.set(key, { html, bytes })
  cacheBytes += bytes
}

/** Renders README markup without registering request-specific global Marked extensions. */
export function renderReadme (readme: string, asset: ReadmeAsset): string {
  const cacheKey = getCacheKey(readme, asset)
  const cached = renderedReadmeCache.get(cacheKey)
  if (cached !== undefined) {
    // Refresh insertion order so eviction behaves like an LRU cache.
    renderedReadmeCache.delete(cacheKey)
    renderedReadmeCache.set(cacheKey, cached)
    return cached.html
  }

  const browseUrl = asset.browse_url
  const branch = resolveBranch(asset.icon_url)

  const renderer = new Renderer()
  renderer.image = function (href: string | null, title: string | null, text: string) {
    const imageUrl = href !== null && href !== ''
      ? resolveImageUrl(href, browseUrl, branch)
      : '/images/noimage.png'
    const alt = title ?? text ?? 'image'
    return `<img src="${imageUrl}" data-fallback-image="/images/noimage.png" alt="README ${alt}" />`
  }
  renderer.html = function (html: string) {
    if (!html.includes('<img') || typeof browseUrl !== 'string') {
      return html
    }

    if (browseUrl.includes('gitlab.com')) {
      return html.replace(/<img/g, `<img data-host="${browseUrl}/-/raw/${branch}/" data-fallback-image="/images/noimage.png"`)
    }

    if (browseUrl.includes('github.com')) {
      return html.replace(/<img/g, `<img data-host="${browseUrl}/raw/${branch}/" data-fallback-image="/images/noimage.png"`)
    }

    return html
  }

  // Supplying a renderer to parse is request-local. marked.use() would retain it globally.
  const html = purify.sanitize(marked.parse(readme, { renderer }))
  cacheRenderedReadme(cacheKey, html)
  return html
}
