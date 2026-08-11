import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getSiteFileContent, invalidateSiteFileCache } from '../src/core/utils/siteFiles'

describe('site files cache', () => {
  it('degrades to null instead of throwing when the database is unavailable', async () => {
    // No Mongo connection is established in the test process, so the loader
    // rejects; the cache must swallow that and report "no content" rather than
    // letting the site-file routes error.
    assert.equal(await getSiteFileContent('ads.txt'), null)
    assert.equal(await getSiteFileContent('security.txt'), null)
    assert.equal(await getSiteFileContent('.well-known/security.txt'), null)
  })

  it('invalidates the cache without throwing', () => {
    assert.doesNotThrow(() => {
      invalidateSiteFileCache()
    })
  })
})
