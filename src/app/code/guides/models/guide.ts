import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import { marked } from 'marked'

export interface Guide {
  slug: string
  title: string
  description: string
  date: string
  updated: string
  order: number
  category: string
  html: string
  url: string
  readMinutes: number
  wordCount: number
}

// The bundle lives at dist/bundle.js, so __dirname === dist/ and the markdown
// content copied by BuildTaskRunner lives at dist/content/guides.
const GUIDES_DIR = path.join(__dirname, 'content/guides')
const CACHE_TTL_MS = 60_000
let cachedGuides: Guide[] | null = null
let cacheExpiresAt = 0

/** Minimal `---`-delimited frontmatter parser. */
function parseFrontmatter (raw: string): { meta: Record<string, string>, body: string } {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
    if (end > 0) {
      const meta: Record<string, string> = {}
      for (const line of lines.slice(1, end)) {
        const separator = line.indexOf(':')
        if (separator > 0) {
          meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
        }
      }
      return { meta, body: lines.slice(end + 1).join('\n') }
    }
  }
  return { meta: {}, body: raw }
}

function loadGuideFile (filename: string): Guide {
  const filePath = path.join(GUIDES_DIR, filename)
  const raw = readFileSync(filePath, 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const slug = meta.slug ?? filename.replace(/\.md$/, '')
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length
  return {
    slug,
    title: meta.title ?? slug,
    description: meta.description ?? '',
    date: meta.date ?? '',
    updated: meta.updated ?? meta.date ?? '',
    order: Number.parseInt(meta.order ?? '100', 10),
    category: meta.category ?? 'general',
    // Guide content is first-party and trusted, so raw marked output is safe
    // (unlike imported READMEs, which go through DOMPurify).
    html: marked.parse(body),
    url: `/guides/${slug}`,
    readMinutes: Math.max(1, Math.round(wordCount / 200)),
    wordCount
  }
}

/** Load all guides sorted by frontmatter order, with a short TTL cache. */
export function getAllGuides (): Guide[] {
  const now = Date.now()
  if (cachedGuides !== null && cacheExpiresAt > now) {
    return cachedGuides
  }
  if (!existsSync(GUIDES_DIR)) {
    cachedGuides = []
    cacheExpiresAt = now + CACHE_TTL_MS
    return cachedGuides
  }
  const guides = readdirSync(GUIDES_DIR)
    .filter(filename => filename.endsWith('.md'))
    .map(loadGuideFile)
    .sort((a, b) => a.order - b.order)
  cachedGuides = guides
  cacheExpiresAt = now + CACHE_TTL_MS
  return guides
}

/** Find a single guide by slug. */
export function getGuideBySlug (slug: string): Guide | undefined {
  return getAllGuides().find(guide => guide.slug === slug)
}
