import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { marked, Renderer } from 'marked'

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

/** Renders README markup without registering request-specific global Marked extensions. */
export function renderReadme (readme: string, asset: ReadmeAsset): string {
  const window = new JSDOM('<!DOCTYPE html>').window
  const purify = DOMPurify(window as unknown as Window)
  const browseUrl = asset.browse_url
  const branch = resolveBranch(asset.icon_url)

  try {
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
    return purify.sanitize(marked.parse(readme, { renderer }))
  } finally {
    window.close()
  }
}
