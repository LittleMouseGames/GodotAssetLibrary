import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createStoreApiClient, StoreTransport, StoreTransportResponse } from '../src/app/utilities/fetchFromGodotStore/services/StoreApiClient'

function response (status: number, body: string, headers: Record<string, string> = {}): StoreTransportResponse {
  return { status, body, headers }
}

function fakeTransport (handler: (path: string, attempt: number) => StoreTransportResponse): StoreTransport & { calls: string[] } {
  const calls: string[] = []
  const attempts = new Map<string, number>()
  return {
    calls,
    async get (path: string) {
      calls.push(path)
      const attempt = attempts.get(path) ?? 0
      attempts.set(path, attempt + 1)
      return handler(path, attempt)
    }
  }
}

describe('createStoreApiClient', () => {
  it('parses the X-Pagination header on listings', async () => {
    const transport = fakeTransport((path, attempt) => {
      assert.equal(attempt, 0)
      assert.ok(path.includes('/api/v1/assets/'))
      assert.ok(path.includes('page=2'))
      assert.ok(path.includes('page_size=100'))
      return response(200, JSON.stringify([{ slug: 'a', publisher: { slug: 'p' } }]), {
        'x-pagination': JSON.stringify({ total: 1204, total_pages: 13, page: 2, next_page: 3, previous_page: 1 })
      })
    })
    const client = createStoreApiClient(transport)
    const result = await client.fetchAssetListings({ page: 2, pageSize: 100 })
    assert.equal(result.assets.length, 1)
    assert.equal(result.pagination?.total, 1204)
    assert.equal(result.pagination?.next_page, 3)
  })

  it('retries transient 429/5xx and honors Retry-After', async () => {
    let calls = 0
    const transport = fakeTransport((_path, attempt) => {
      calls++
      if (attempt === 0) return response(429, '{}', { 'retry-after': '0' })
      if (attempt === 1) return response(503, '{}')
      return response(200, JSON.stringify({ ok: true }))
    })
    const client = createStoreApiClient(transport)
    const result = await client.fetchAssetDetail('publisher', 'asset')
    assert.deepEqual(result, { ok: true })
    assert.equal(calls, 3)
  })

  it('throws on a final non-retryable status', async () => {
    const transport = fakeTransport(() => response(404, '{}'))
    const client = createStoreApiClient(transport)
    await assert.rejects(async () => { await client.fetchAssetReleases('p', 'a') }, /status 404/)
  })

  it('rejects malformed JSON', async () => {
    const transport = fakeTransport(() => response(200, 'not json'))
    const client = createStoreApiClient(transport)
    await assert.rejects(async () => { await client.fetchAssetDetail('p', 'a') })
  })

  it('returns an empty array for a non-array releases payload', async () => {
    const transport = fakeTransport(() => response(200, JSON.stringify({ not: 'array' })))
    const client = createStoreApiClient(transport)
    const releases = await client.fetchAssetReleases('p', 'a')
    assert.deepEqual(releases, [])
  })

  it('encodes publisher/asset slugs in detail paths', async () => {
    const transport = fakeTransport(() => response(200, JSON.stringify({ slug: 'my asset' })))
    const client = createStoreApiClient(transport)
    await client.fetchAssetDetail('my pub', 'my asset')
    assert.ok(transport.calls[0].includes('/my%20pub/my%20asset/'))
  })
})
