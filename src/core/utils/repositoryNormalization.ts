/**
 * Normalize Git repository URLs so a legacy Asset Library `browse_url` can be
 * compared with a Store `source` URL to find the same upstream project.
 *
 * Only well-known Git hosts are normalized; anything else (websites, profiles,
 * sub-pages, unknown hosts) returns null so the caller never auto-links on
 * weak evidence.
 */

const KNOWN_GIT_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'gitea.com',
  'gitgud.io',
  'sr.ht',
  'notabug.org'
])

/** Host aliases that all map to one canonical host. */
const HOST_ALIASES: Record<string, string> = {
  'www.github.com': 'github.com',
  'www.gitlab.com': 'gitlab.com',
  'www.bitbucket.org': 'bitbucket.org',
  'www.codeberg.org': 'codeberg.org',
  'github.io': 'github.com'
}

/**
 * Normalize a repository URL into a stable `host/owner/repo` key, or null when
 * the value is not a recognizable project repository URL.
 *
 * Strips credentials, query, fragment, trailing slashes and `.git`. Rejects
 * profile/org URLs (no repo segment), subdirectory URLs (more than two path
 * segments) and issue/wiki/release/archive paths. Also rejects URLs that embed
 * extra path segments beyond owner/repo (monorepos are intentionally not
 * auto-linked on a single repo URL).
 */
export function normalizeRepositoryUrl (value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username !== '' || parsed.password !== '') return null

  const host = HOST_ALIASES[parsed.hostname.toLowerCase()] ?? parsed.hostname.toLowerCase()
  if (!KNOWN_GIT_HOSTS.has(host)) return null

  let segments = parsed.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment))

  // Strip a trailing ".git" from the final segment (a repository path marker).
  if (segments.length > 0) {
    const last = segments[segments.length - 1]
    if (last.endsWith('.git')) {
      segments = [...segments.slice(0, -1), last.slice(0, -'.git'.length)]
    }
  }

  // sr.ht uses /~user/repo; keep the tilde prefix as part of the owner segment.
  if (host === 'sr.ht' && segments.length === 3 && segments[0].startsWith('~')) {
    segments = [segments[0], segments[1], segments[2]]
  }

  if (segments.length !== 2) return null
  if (segments[0] === '' || segments[1] === '') return null

  // Reject repo names that are clearly not a single project (dot-directories,
  // generated archives).
  if (segments[0].startsWith('.') || segments[1].startsWith('.')) return null

  return `${host}/${segments[0].toLowerCase()}/${segments[1].toLowerCase()}`
}

/**
 * Very strict normalized-title key used as a secondary signal when linking.
 * Lowercases and strips punctuation/whitespace so "Maaack's Game Template"
 * and "Maaack’s Game Template" compare equal without becoming fuzzy.
 */
export function normalizeProjectTitle (value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
