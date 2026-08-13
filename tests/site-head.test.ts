import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getSiteHead, invalidateSiteHeadCache } from '../src/core/utils/siteHead'

describe('site head cache', () => {
  it('degrades to an empty string instead of throwing when the database is unavailable', async () => {
    // No Mongo connection is established in the test process, so the loader
    // rejects; the cache must swallow that and report "no content" rather than
    // letting the global _locals middleware error on every page.
    assert.equal(await getSiteHead(), '')
    assert.equal(await getSiteHead(), '')
  })

  it('invalidates the cache without throwing', () => {
    assert.doesNotThrow(() => {
      invalidateSiteHeadCache()
    })
  })
})
