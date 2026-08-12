import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cacheGetOrLoad, buildAssetCacheKey, buildUserContextCacheKey } from '../src/core/utils/dragonfly'
import { reset, snapshot } from '../src/core/utils/telemetry'

describe('Dragonfly cache', () => {
  it('falls back to the loader when the shared cache is disabled', async () => {
    const previous = process.env.CACHE_ENABLED
    process.env.CACHE_ENABLED = 'false'
    reset()
    let loads = 0

    try {
      const result = await cacheGetOrLoad('test:disabled', 60, async () => {
        loads++
        return { ok: true }
      })

      assert.deepEqual(result, { value: { ok: true }, hit: false })
      assert.equal(loads, 1)
      assert.equal(snapshot().cacheMisses, 1)
      assert.equal(snapshot().cacheBypasses, 1)
    } finally {
      if (previous === undefined) {
        delete process.env.CACHE_ENABLED
      } else {
        process.env.CACHE_ENABLED = previous
      }
    }
  })

  it('builds a stable asset page cache key', () => {
    assert.equal(buildAssetCacheKey('abc-123'), 'gda:v1:asset:abc-123')
    assert.equal(buildAssetCacheKey('abc-123'), buildAssetCacheKey('abc-123'))
  })

  it('builds a stable user context cache key', () => {
    assert.equal(buildUserContextCacheKey('tok-1'), 'gda:v1:userctx:tok-1')
    assert.equal(buildUserContextCacheKey('tok-1'), buildUserContextCacheKey('tok-1'))
  })
})
