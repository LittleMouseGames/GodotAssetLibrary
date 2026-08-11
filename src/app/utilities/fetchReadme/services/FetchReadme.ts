import { logger } from 'core/utils/logger'
import { UpdateAssetReadme } from '../models/UPDATE/UpdateAssetReadme'
import { UpdateAssetReadmeState } from '../models/UPDATE/UpdateAssetReadmeState'
import fetch, { Response } from 'node-fetch'
import AdmZip from 'adm-zip'

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
const MAX_README_BYTES = 2 * 1024 * 1024
const MAX_ZIP_ENTRIES = 10_000
const FETCH_TIMEOUT_MS = 30_000

/** True for IPv4 addresses in private, loopback, link-local or reserved ranges. */
function isPrivateIpv4 (ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
  const [a, b] = parts
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0) || // 192.0.0.0/24 + TEST-NET
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    a >= 224 // multicast + reserved
  )
}

/**
 * Reject http(s) URLs that are SSRF hazards in background fetches: credentials,
 * localhost/.local hosts, and private/reserved IP literals (IPv4, IPv6 and
 * IPv4-mapped IPv6).
 */
function isSafeDownloadUrl (rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (parsed.username !== '' || parsed.password !== '') return false
    const host = parsed.hostname.toLowerCase()
    if (host === '') return false
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false

    if (host.includes(':')) {
      const clean = host.startsWith('[') ? host.slice(1, -1) : host
      if (clean === '::1' || clean === '::') return false
      const mapped = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
      if (mapped !== null) return !isPrivateIpv4(mapped[1])
      // Reject ULA (fc00::/7), link-local (fe80::/10) and any other literal we
      // cannot confidently classify as public.
      return false
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return !isPrivateIpv4(host)
    return true
  } catch (e) {
    return false
  }
}

/** Follow up to maxRedirects redirects, validating every hop as safe. */
async function fetchSafe (rawUrl: string, maxRedirects = 3): Promise<Response> {
  let currentUrl = rawUrl
  for (let attempt = 0; attempt <= maxRedirects; attempt++) {
    if (!isSafeDownloadUrl(currentUrl)) {
      throw new Error('Unsafe download URL')
    }
    const response = await fetch(currentUrl, {
      timeout: FETCH_TIMEOUT_MS,
      size: MAX_ARCHIVE_BYTES,
      redirect: 'manual'
    })
    const status = response.status
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location')
      ;(response.body as NodeJS.ReadableStream & { destroy?: () => void })?.destroy?.()
      if (location === null || location === '') throw new Error('Redirect without a location')
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }
    return response
  }
  throw new Error('Too many redirects')
}

export const FetchReadme = async function (assetId: string, url: string): Promise<void> {
  if (typeof url !== 'string' || !isSafeDownloadUrl(url)) {
    await UpdateAssetReadmeState(assetId, { status: 'error', error: 'Unsafe or invalid download URL' })
    return
  }

  try {
    const response = await fetchSafe(url)

    if (!response.ok) {
      const body = response.body as NodeJS.ReadableStream & { destroy?: () => void }
      body?.destroy?.()
      throw new Error(`Archive download returned HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
      const body = response.body as NodeJS.ReadableStream & { destroy?: () => void }
      body?.destroy?.()
      throw new Error(`Archive exceeds ${MAX_ARCHIVE_BYTES} byte limit`)
    }

    const archive = await response.buffer()
    const zip = new AdmZip(archive)
    const entries = zip.getEntries()

    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new Error(`Archive contains more than ${MAX_ZIP_ENTRIES} entries`)
    }

    const readmeEntry = entries.find(entry => /(^|\/)readme(?:\.[^/]+)?$/i.test(entry.entryName))
    if (readmeEntry === undefined) {
      await UpdateAssetReadme(assetId, '')
      await UpdateAssetReadmeState(assetId, { status: 'missing' })
      return
    }

    const uncompressedSize = Number((readmeEntry as any).header?.size)
    if (!Number.isFinite(uncompressedSize) || uncompressedSize < 0 || uncompressedSize > MAX_README_BYTES) {
      throw new Error(`README exceeds ${MAX_README_BYTES} byte limit`)
    }

    const readme = zip.readAsText(readmeEntry)
    if (Buffer.byteLength(readme, 'utf8') > MAX_README_BYTES) {
      throw new Error(`README actual content exceeds ${MAX_README_BYTES} byte limit`)
    }
    await UpdateAssetReadme(assetId, readme)
    await UpdateAssetReadmeState(assetId, { status: 'ok' })
  } catch (error: any) {
    logger.log('error', `Failed to fetch README for asset ${assetId}: ${error?.message ?? error}`, [error])
    await UpdateAssetReadmeState(assetId, { status: 'error', error: error?.message ?? 'Unknown error' })
  }
}
