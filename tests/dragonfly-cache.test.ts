import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cacheGetOrLoad,
  buildAssetCacheKey,
  buildAllAssetCacheKeys,
  buildUserContextCacheKey,
  buildAssetEpochKey,
  buildEnvelope,
  isEnvelopeFresh,
  isEnvelopeStaleServable,
  getAssetEpoch
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

describe('cache envelopes', () => {
  it('marks envelopes fresh until freshUntil and stale-servable inside the stale window', () => {
    const now = 1_000_000
    const envelope = buildEnvelope({ ok: true }, 5000, 86_400_000, now)
    assert.equal(isEnvelopeFresh(envelope, now), true)
    assert.equal(isEnvelopeStaleServable(envelope, now), false)
    // Past the fresh window, within the stale window -> servable stale.
    assert.equal(isEnvelopeFresh(envelope, now + 5001), false)
    assert.equal(isEnvelopeStaleServable(envelope, now + 5001), true)
    // Past the stale window -> not servable at all.
    assert.equal(isEnvelopeFresh(envelope, now + 5000 + 86_400_000), false)
    assert.equal(isEnvelopeStaleServable(envelope, now + 5000 + 86_400_000), false)
  })

  it('collapses the stale window when the stale TTL is zero', () => {
    const now = 1_000_000
    const envelope = buildEnvelope({ ok: true }, 3000, 0, now)
    assert.equal(isEnvelopeFresh(envelope, now + 2999), true)
    assert.equal(isEnvelopeFresh(envelope, now + 3000), false)
    assert.equal(isEnvelopeStaleServable(envelope, now + 3000), false)
  })
})

describe('asset epoch keys', () => {
  it('builds a stable per-asset epoch key', () => {
    assert.equal(buildAssetEpochKey('abc-123'), 'gda:v2:assetepoch:abc-123')
    assert.equal(buildAssetEpochKey('abc-123'), buildAssetEpochKey('abc-123'))
    assert.notEqual(buildAssetEpochKey('abc-123'), buildAssetEpochKey('xyz-456'))
  })

  it('returns null for the asset epoch while the cache is disabled (fail-open)', async () => {
    const previous = process.env.CACHE_ENABLED
    process.env.CACHE_ENABLED = 'false'
    try {
      assert.equal(await getAssetEpoch('abc-123'), null)
    } finally {
      if (previous === undefined) {
        delete process.env.CACHE_ENABLED
      } else {
        process.env.CACHE_ENABLED = previous
      }
    }
  })
})
