import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cacheGetOrLoad } from '../src/core/utils/dragonfly'
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
})
