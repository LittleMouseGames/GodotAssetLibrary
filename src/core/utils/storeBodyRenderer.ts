/**
 * Sanitization for Godot Asset Store body/changelog HTML.
 *
 * The Store serves publisher-authored `body_html` and release `changes_html`.
 * These are untrusted content and MUST be sanitized before any unescaped
 * render. Unlike the legacy README renderer (Markdown + repository-relative
 * images), this handles raw HTML directly with a single shared JSDOM/DOMPurify
 * environment and a bounded cache.
 *
 * Policy:
 * - Remove scripts, styles, iframes, objects, embeds, forms, SVG/MathML and
 *   event-handler/inline-style attributes.
 * - Keep a conservative documentation set (headings, paragraphs, lists,
 *   tables, code, blockquote, links, images).
 * - Only safe http(s) URLs (plus mailto:, fragments, and root-relative links)
 *   survive; external links get rel="noopener noreferrer nofollow".
 * - Output is byte-bounded; oversized input yields an empty string.
 */

import DOMPurify from 'dompurify'
import { createHash } from 'crypto'
import { JSDOM } from 'jsdom'

const window = new JSDOM('<!DOCTYPE html>').window
const purify = DOMPurify(window as unknown as Window)

const renderedBodyCache = new Map<string, string>()
const MAX_CACHE_BYTES = 16 * 1024 * 1024
let cacheBytes = 0

const MAX_INPUT_BYTES = 1024 * 1024 // 1 MiB
const MAX_OUTPUT_BYTES = 512 * 1024 // 512 KiB

const ALLOWED_TAGS = [
  'a', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'b', 'i',
  'u', 's', 'sub', 'sup', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'caption', 'img', 'figure', 'figcaption', 'div', 'span', 'details', 'summary'
]

const ALLOWED_ATTRS = [
  'href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height',
  'align', 'colspan', 'rowspan', 'class'
]

const FORBID_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg', 'math', 'link', 'meta', 'base']

function cacheKey (html: string): string {
  return createHash('sha256').update(html).digest('base64')
}

function cachePut (key: string, value: string): void {
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > MAX_CACHE_BYTES) return
  while (cacheBytes + bytes > MAX_CACHE_BYTES && renderedBodyCache.size > 0) {
    const oldestKey = renderedBodyCache.keys().next().value as string
    const oldest = renderedBodyCache.get(oldestKey)
    if (oldest !== undefined) cacheBytes -= Buffer.byteLength(oldest, 'utf8')
    renderedBodyCache.delete(oldestKey)
  }
  renderedBodyCache.set(key, value)
  cacheBytes += bytes
}

function hooks (): void {
  purify.addHook('afterSanitizeAttributes', (node: any) => {
    // Remove javascript:/data:/vbscript: URLs entirely.
    for (const attr of ['href', 'src', 'xlink:href']) {
      const value = node.getAttribute(attr)
      if (typeof value === 'string' && !/^(https?:|mailto:|#|\/)/i.test(value)) {
        node.removeAttribute(attr)
      }
    }
    if (node.tagName === 'A' && node.getAttribute('href') !== null) {
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })
}

hooks()

/**
 * Sanitize Store HTML for safe unescaped rendering. Returns '' when the input
 * is empty, oversized, or produces nothing safe after sanitization.
 */
export function sanitizeStoreHtml (html: unknown): string {
  if (typeof html !== 'string') return ''
  const trimmed = html.trim()
  if (trimmed === '') return ''
  if (Buffer.byteLength(trimmed, 'utf8') > MAX_INPUT_BYTES) return ''

  const key = cacheKey(trimmed)
  const cached = renderedBodyCache.get(key)
  if (cached !== undefined) {
    renderedBodyCache.delete(key)
    renderedBodyCache.set(key, cached)
    return cached
  }

  const cleaned = purify.sanitize(trimmed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    FORBID_TAGS,
    ALLOW_DATA_ATTR: false
  })

  if (Buffer.byteLength(cleaned, 'utf8') > MAX_OUTPUT_BYTES) return ''

  cachePut(key, cleaned)
  return cleaned
}

/**
 * Whether a Store record has sanitized HTML body content worth rendering.
 */
export function storeBodyForRender (body: { sanitized_html?: string } | null | undefined): string {
  if (body == null) return ''
  const html = sanitizeStoreHtml(body.sanitized_html)
  return html
}
