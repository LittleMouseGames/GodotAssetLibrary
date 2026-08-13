import fs from 'fs'
import path from 'path'

let cachedReleaseId: string | null = null

/**
 * A stable identifier for the current deployment, shared by every worker and
 * replica so static-asset cache busters (`?cache=<id>`) converge instead of
 * differing per worker restart (which previously created duplicate cached
 * copies and cold static traffic on every refork).
 *
 * Prefer the RELEASE_ID environment variable (set at build/deploy time). When
 * it is absent, derive the id from the compiled bundle's size+mtime so it
 * changes only when the bundle changes; fall back to a per-process constant
 * only when no bundle file is visible (e.g. inside a test process).
 */
export function getReleaseId (): string {
  if (cachedReleaseId !== null) return cachedReleaseId

  const configured = process.env.RELEASE_ID?.trim()
  if (configured !== undefined && configured !== '') {
    cachedReleaseId = configured
    return configured
  }

  const candidates = [
    // Bundled: __dirname is dist/, so this is dist/bundle.js itself.
    path.join(__dirname, 'bundle.js'),
    // Source/test runs: look in the repo root's dist/ if present.
    path.join(process.cwd(), 'dist', 'bundle.js')
  ]
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        cachedReleaseId = `${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}`
        return cachedReleaseId
      }
    } catch {
      // fall through to the next candidate / final fallback
    }
  }

  cachedReleaseId = Date.now().toString(16)
  return cachedReleaseId
}
