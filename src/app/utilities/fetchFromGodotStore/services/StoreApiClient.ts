/**
 * Godot Asset Store API client.
 *
 * All endpoints are unauthenticated read-only GETs (the same contract the
 * official Godot editor uses). The transport is injectable so tests can stub
 * responses without network access.
 *
 * Resilience:
 * - bounded retries with exponential backoff for 429/5xx,
 * - honors `Retry-After` when present,
 * - response size + total-deadline limits,
 * - parses the `X-Pagination` header on the assets listing,
 * - NEVER logs response bodies or query strings (signed URLs must not leak).
 */

import * as https from 'https'
import { StoreAssetData, StoreAssetDataDetailed, StorePaginationMetadata, StoreReleaseData } from '../schema/storeApi'

export interface StoreTransportResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

export interface StoreTransport {
  get: (path: string) => Promise<StoreTransportResponse>
}

export const STORE_API_HOST = 'store.godotengine.org'
export const STORE_API_BASE_PATH = '/api/v1'

const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 3

function headerValue (headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  if (value === undefined) return undefined
  return Array.isArray(value) ? (value[0] ?? undefined) : value
}

async function sleep (ms: number): Promise<void> {
  return await new Promise(resolve => setTimeout(resolve, ms))
}

function delayForAttempt (attempt: number, retryAfterSeconds: number | null): number {
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(60_000, Math.max(250, retryAfterSeconds * 1000))
  }
  return Math.min(30_000, 250 * Math.pow(2, attempt))
}

function parseRetryAfter (headers: Record<string, string | string[] | undefined>): number | null {
  const raw = headerValue(headers, 'retry-after')
  if (raw === undefined) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function parsePaginationHeader (headers: Record<string, string | string[] | undefined>): StorePaginationMetadata | undefined {
  const raw = headerValue(headers, 'x-pagination')
  if (raw === undefined || raw === '') return undefined
  try {
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const numeric = (value: unknown): number => Number.isSafeInteger(value) ? (value as number) : 0
    const nullableNumeric = (value: unknown): number | null =>
      value == null ? null : (Number.isSafeInteger(value) ? (value as number) : null)
    return {
      total: numeric(parsed.total),
      total_pages: numeric(parsed.total_pages),
      page: numeric(parsed.page),
      next_page: nullableNumeric(parsed.next_page),
      previous_page: nullableNumeric(parsed.previous_page)
    }
  } catch {
    return undefined
  }
}

/** Default https-based transport (like nodeFetch but exposes status + headers). */
const httpsTransport: StoreTransport = {
  async get (path: string): Promise<StoreTransportResponse> {
    return await new Promise<StoreTransportResponse>((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void): void => {
        if (!settled) {
          settled = true
          clearTimeout(totalTimer)
          fn()
        }
      }

      const totalTimer = setTimeout(
        () => request.destroy(new Error('Request exceeded total deadline')),
        DEFAULT_TIMEOUT_MS
      )

      const request = https.request({
        host: STORE_API_HOST,
        path,
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': 'GodotAssetLibrary/1.0 (open source catalog)'
        }
      }, (response) => {
        const contentLength = Number(response.headers['content-length'])
        if (Number.isFinite(contentLength) && contentLength > DEFAULT_MAX_RESPONSE_SIZE) {
          response.destroy()
          settle(() => reject(new Error('Response exceeds size limit')))
          return
        }

        let size = 0
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > DEFAULT_MAX_RESPONSE_SIZE) {
            response.destroy()
            settle(() => reject(new Error('Response exceeds size limit')))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          const headers: Record<string, string | string[] | undefined> = {}
          for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === 'string' || value === undefined || Array.isArray(value)) headers[key] = value
          }
          settle(() => resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8')
          }))
        })
        response.on('error', (error) => settle(() => reject(error)))
      })

      request.on('error', (error) => settle(() => reject(error)))
      request.setTimeout(DEFAULT_TIMEOUT_MS, () => request.destroy(new Error('Request timed out')))
      request.end()
    })
  }
}

function buildQueryString (params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query !== '' ? `?${query}` : ''
}

export interface StoreListingsResult {
  assets: StoreAssetData[]
  pagination: StorePaginationMetadata | undefined
}

export interface StoreApiClient {
  /** GET /api/v1/assets/ — one page of the full inventory. */
  fetchAssetListings: (params: { page: number, pageSize: number, requireRelease?: boolean, stableOnly?: boolean }) => Promise<StoreListingsResult>
  /** GET /api/v1/assets/{publisher_slug}/{asset_slug}/ */
  fetchAssetDetail: (publisherSlug: string, assetSlug: string) => Promise<StoreAssetDataDetailed>
  /** GET /api/v1/releases/{publisher_slug}/{asset_slug}/ */
  fetchAssetReleases: (publisherSlug: string, assetSlug: string) => Promise<StoreReleaseData[]>
}

/**
 * Create a Store API client. `transport` is injectable for tests; the default
 * uses a bounded https GET. Retries are applied per call for transient 429/5xx
 * responses.
 */
export function createStoreApiClient (transport: StoreTransport = httpsTransport): StoreApiClient {
  async function getJson<T> (path: string, expectedList = false): Promise<{ data: T, pagination?: StorePaginationMetadata }> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
      try {
        const response = await transport.get(path)
        if (response.status >= 200 && response.status < 300) {
          const pagination = expectedList ? parsePaginationHeader(response.headers) : undefined
          return { data: JSON.parse(response.body) as T, pagination }
        }

        const retryable = response.status === 429 || response.status >= 500
        if (retryable && attempt < DEFAULT_RETRIES) {
          const retryAfter = parseRetryAfter(response.headers)
          await sleep(delayForAttempt(attempt, retryAfter))
          continue
        }

        throw new Error(`Store API returned status ${response.status} for ${path}`)
      } catch (error: any) {
        lastError = error
        if (error?.name === 'SyntaxError') throw error
        if (attempt >= DEFAULT_RETRIES) break
        await sleep(delayForAttempt(attempt, null))
      }
    }
    throw lastError ?? new Error(`Store API request failed for ${path}`)
  }

  return {
    async fetchAssetListings ({ page, pageSize, requireRelease = true, stableOnly = false }): Promise<StoreListingsResult> {
      const path = `${STORE_API_BASE_PATH}/assets/${buildQueryString({
        page: Math.max(1, page),
        page_size: Math.min(100, Math.max(1, pageSize)),
        require_release: requireRelease ? 'true' : 'false',
        stable_only: stableOnly ? 'true' : 'false'
      })}`
      const { data, pagination } = await getJson<StoreAssetData[]>(path, true)
      return { assets: Array.isArray(data) ? data : [], pagination }
    },

    async fetchAssetDetail (publisherSlug: string, assetSlug: string): Promise<StoreAssetDataDetailed> {
      const path = `${STORE_API_BASE_PATH}/assets/${encodeURIComponent(publisherSlug)}/${encodeURIComponent(assetSlug)}/`
      const { data } = await getJson<StoreAssetDataDetailed>(path)
      return data
    },

    async fetchAssetReleases (publisherSlug: string, assetSlug: string): Promise<StoreReleaseData[]> {
      const path = `${STORE_API_BASE_PATH}/releases/${encodeURIComponent(publisherSlug)}/${encodeURIComponent(assetSlug)}/`
      const { data } = await getJson<StoreReleaseData[]>(path)
      return Array.isArray(data) ? data : []
    }
  }
}
