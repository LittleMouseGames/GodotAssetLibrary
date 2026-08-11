import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeHttpUrl } from '../src/core/utils/safeUrl'

describe('isSafeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    assert.equal(isSafeHttpUrl('https://example.com/asset.zip'), true)
    assert.equal(isSafeHttpUrl('http://example.com/asset.zip'), true)
    assert.equal(isSafeHttpUrl('  https://example.com  '), true)
  })

  it('rejects non-http schemes', () => {
    assert.equal(isSafeHttpUrl('javascript:alert(1)'), false)
    assert.equal(isSafeHttpUrl('data:text/html,hi'), false)
    assert.equal(isSafeHttpUrl('file:///etc/passwd'), false)
    assert.equal(isSafeHttpUrl('ftp://example.com/file'), false)
  })

  it('rejects empty, whitespace, and malformed values', () => {
    assert.equal(isSafeHttpUrl(''), false)
    assert.equal(isSafeHttpUrl('   '), false)
    assert.equal(isSafeHttpUrl('not a url'), false)
    assert.equal(isSafeHttpUrl('/relative/path'), false)
    assert.equal(isSafeHttpUrl(undefined), false)
    assert.equal(isSafeHttpUrl(null), false)
    assert.equal(isSafeHttpUrl(123), false)
  })
})
