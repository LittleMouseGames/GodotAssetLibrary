import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cacheGetOrLoad,
  buildAssetCacheKey,
  buildAllAssetCacheKeys,
  buildUserContextCacheKey
} from '../src/core/utils/dragonfly'
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

  it('builds major-partitioned asset page cache keys', () => {
    assert.equal(buildAssetCacheKey('abc-123', 4), 'gda:v2:asset:abc-123:4')
    assert.equal(buildAssetCacheKey('abc-123', undefined), 'gda:v2:asset:abc-123:all')
    assert.equal(buildAssetCacheKey('abc-123', 4), buildAssetCacheKey('abc-123', 4))
    assert.notEqual(buildAssetCacheKey('abc-123', 4), buildAssetCacheKey('abc-123', 3))
  })

  it('returns every PDP cache variant for invalidation', () => {
    const variants = buildAllAssetCacheKeys('abc-123')
    assert.equal(variants.length, 4)
    assert.deepEqual(
      [...variants].sort(),
      [
        'gda:v2:asset:abc-123:2',
        'gda:v2:asset:abc-123:3',
        'gda:v2:asset:abc-123:4',
        'gda:v2:asset:abc-123:all'
      ].sort()
    )
  })

  it('builds a stable user context cache key', () => {
    assert.equal(buildUserContextCacheKey('tok-1'), 'gda:v1:userctx:tok-1')
    assert.equal(buildUserContextCacheKey('tok-1'), buildUserContextCacheKey('tok-1'))
  })
})
