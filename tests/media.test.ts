import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePreviews } from '../src/core/utils/mediaHelpers'

describe('normalizePreviews', () => {
  it('classifies YouTube links as embeddable videos', () => {
    const items = normalizePreviews([
      { link: 'https://www.youtube.com/watch?v=abc123def45' }
    ])
    assert.equal(items.length, 1)
    assert.equal(items[0].type, 'video')
    assert.ok(items[0].embedUrl?.includes('embed/abc123def45'))
  })

  it('classifies image extensions and thumbnailed links as images', () => {
    const items = normalizePreviews([
      { link: 'https://example.com/screenshot.png' },
      { link: 'https://example.com/preview', thumbnail: 'https://example.com/thumb.jpg' }
    ])
    assert.equal(items.length, 2)
    assert.ok(items.every(item => item.type === 'image'))
  })

  it('classifies non-YouTube video files as external, not broken images', () => {
    const items = normalizePreviews([
      { link: 'https://example.com/trailer.mp4' },
      { link: 'https://example.com/clip.webm' }
    ])
    assert.equal(items.length, 2)
    assert.ok(items.every(item => item.type === 'external'))
  })

  it('classifies unknown unthumbnailed links as external', () => {
    const items = normalizePreviews([
      { link: 'https://example.com/some-preview' }
    ])
    assert.equal(items[0].type, 'external')
  })

  it('drops non-http(s) and malformed links entirely', () => {
    const items = normalizePreviews([
      { link: 'javascript:alert(1)' },
      { link: 'not a url' },
      { link: '' },
      { link: 'data:text/html,hi' }
    ])
    assert.equal(items.length, 0)
  })

  it('returns an empty list for non-array input', () => {
    assert.deepEqual(normalizePreviews(undefined), [])
    assert.deepEqual(normalizePreviews(null), [])
  })
})
