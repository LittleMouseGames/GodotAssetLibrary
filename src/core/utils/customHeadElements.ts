import { GetCustomHeadElements } from 'app/code/admin/models/GET/GetCustomHeadElements'

/**
 * Allowlisted HTML tag names that are valid inside `<head>`. Any element whose
 * opening tag does not start with one of these names is rejected.
 */
const ALLOWED_HEAD_TAGS = new Set([
  'meta',
  'link',
  'script',
  'noscript',
  'style',
  'base',
  'title'
])

/**
 * Structural tags that must not appear inside an element value because they
 * could break the document outline or allow content injection.
 *
 * Note: none of these patterns use the global (`g`) flag, so `RegExp.test()`
 * is safe to call repeatedly without resetting `lastIndex`.
 */
const FORBIDDEN_FRAGMENT_PATTERNS = [
  /<\/?(html|head|body)\b/i
]

export const MAX_ELEMENTS = 20
export const MAX_ELEMENT_LENGTH = 5000

/**
 * Validate a single raw-HTML head element string.
 *
 * Rules:
 * 1. Must not be empty.
 * 2. Must not exceed MAX_ELEMENT_LENGTH characters.
 * 3. Must begin with an opening tag whose name is in ALLOWED_HEAD_TAGS.
 * 4. Must not contain structural fragment injections (`<html>`, `<head>`,
 *    `<body>` — opening or closing variants).
 *
 * Returns `null` on success, or an error message string on failure.
 */
export function validateHeadElement (element: string): string | null {
  const trimmed = element.trim()

  if (trimmed.length === 0) {
    return 'Element must not be empty'
  }

  if (trimmed.length > MAX_ELEMENT_LENGTH) {
    return `Element exceeds maximum length of ${MAX_ELEMENT_LENGTH} characters`
  }

  // Extract the opening tag name (case-insensitive).
  const tagMatch = trimmed.match(/^<([A-Za-z][A-Za-z0-9]*)[\s/>]/)
  if (tagMatch === null) {
    return 'Element must begin with a valid HTML opening tag'
  }

  const tagName = tagMatch[1].toLowerCase()
  if (!ALLOWED_HEAD_TAGS.has(tagName)) {
    return `Tag <${tagName}> is not allowed in custom head elements. Allowed tags: ${[...ALLOWED_HEAD_TAGS].join(', ')}`
  }

  for (const pattern of FORBIDDEN_FRAGMENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'Element must not contain structural HTML tags (<html>, <head>, <body>)'
    }
  }

  return null
}

/**
 * Validate the full array of head element strings coming from the admin form.
 *
 * Throws with a descriptive message if validation fails so the AdminService
 * can surface the error to the caller.
 */
export function validateCustomHeadElements (elements: string[]): void {
  if (elements.length > MAX_ELEMENTS) {
    throw new Error(`Too many custom head elements, maximum is ${MAX_ELEMENTS}`)
  }

  for (let i = 0; i < elements.length; i++) {
    const error = validateHeadElement(elements[i])
    if (error !== null) {
      throw new Error(`Custom head element ${i + 1}: ${error}`)
    }
  }
}

// ---------------------------------------------------------------------------
// In-process cache (same pattern as siteFiles / promobar)
// ---------------------------------------------------------------------------

let cachedElements: string[] = []
let cacheExpiresAt = 0
let refreshPromise: Promise<void> | null = null
const TTL_MS = 60_000

async function load (): Promise<void> {
  const elements = await GetCustomHeadElements()
  cachedElements = elements
}

async function refresh (): Promise<void> {
  if (refreshPromise === null) {
    refreshPromise = load()
      .catch(() => {
        // Keep serving the stale value when the database is temporarily unavailable.
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  await refreshPromise
}

/**
 * Return the currently cached custom head elements (strings). The cache is
 * refreshed lazily when stale, so this never blocks a request for more than
 * one in-flight DB call at a time.
 */
export async function getCustomHeadElements (): Promise<string[]> {
  const now = Date.now()
  if (cacheExpiresAt <= now || refreshPromise !== null) {
    cacheExpiresAt = now + TTL_MS
    await refresh()
  }
  return cachedElements
}

function invalidateLocal (): void {
  cacheExpiresAt = 0
  void refresh()
}

/**
 * Invalidate this worker's cache and broadcast to all cluster workers.
 * Call this after saving custom head elements from the admin panel.
 */
export function invalidateCustomHeadElementsCache (): void {
  invalidateLocal()
  if (typeof process.send === 'function') {
    process.send({ type: 'invalidate-custom-head-elements' })
  }
}

/**
 * Local-only invalidation used when this worker receives a broadcast from
 * another worker via the cluster primary. Must not re-broadcast.
 */
export function invalidateCustomHeadElementsCacheLocally (): void {
  invalidateLocal()
}

/**
 * Warm the cache at startup once a database connection is available.
 */
export function primeCustomHeadElementsCache (): void {
  void refresh()
}
