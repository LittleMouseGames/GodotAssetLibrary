import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePreviews, parseYoutubeUrl } from '../src/core/utils/mediaHelpers'

describe('parseYoutubeUrl', () => {
  it('emits privacy-enhanced youtube-nocookie embeds for every supported form', () => {
    assert.equal(
      parseYoutubeUrl('https://www.youtube.com/watch?v=abc123def45'),
      'https://www.youtube-nocookie.com/embed/abc123def45'
    )
    assert.equal(
      parseYoutubeUrl('https://youtu.be/abc123def45'),
      'https://www.youtube-nocookie.com/embed/abc123def45'
    )
    assert.equal(
      parseYoutubeUrl('https://www.youtube.com/shorts/abc123def45'),
      'https://www.youtube-nocookie.com/embed/abc123def45'
    )
    assert.equal(
      parseYoutubeUrl('https://www.youtube.com/embed/abc123def45'),
      'https://www.youtube-nocookie.com/embed/abc123def45'
    )
    assert.equal(
      parseYoutubeUrl('https://www.youtube.com/live/abc123def45'),
      'https://www.youtube-nocookie.com/embed/abc123def45'
    )
    assert.equal(
      parseYoutubeUrl('https://www.youtube-nocookie.com/embed/abc123def45'),
      'https://www.youtube-nocookie.com/embed/abc123def45'
    )
  })

  it('preserves start time parameters', () => {
    assert.equal(
      parseYoutubeUrl('https://www.youtube.com/watch?v=abc123def45&t=75'),
      'https://www.youtube-nocookie.com/embed/abc123def45?start=75'
    )
    assert.equal(
      parseYoutubeUrl('https://youtu.be/abc123def45?t=1m30s'),
      'https://www.youtube-nocookie.com/embed/abc123def45?start=90'
    )
  })

  it('rejects malformed IDs, bad hosts and non-YouTube URLs', () => {
    assert.equal(parseYoutubeUrl('https://www.youtube.com/watch?v=!!bad!!'), null)
    assert.equal(parseYoutubeUrl('https://www.youtube.com/watch?v=ab'), null)
    assert.equal(parseYoutubeUrl('https://vimeo.com/12345'), null)
    assert.equal(parseYoutubeUrl('https://example.com/watch?v=abc123def45'), null)
    assert.equal(parseYoutubeUrl(undefined), null)
  })
})

describe('normalizePreviews', () => {
  it('classifies YouTube links as embeddable videos', () => {
    const items = normalizePreviews([
      { link: 'https://www.youtube.com/watch?v=abc123def45' }
    ])
    assert.equal(items.length, 1)
    assert.equal(items[0].type, 'video')
    assert.equal(items[0].embedUrl, 'https://www.youtube-nocookie.com/embed/abc123def45')
    assert.equal(items[0].videoId, 'abc123def45')
  })

  it('synthesizes a poster from the YouTube video ID when no thumbnail exists', () => {
    const items = normalizePreviews([
      { link: 'https://www.youtube.com/watch?v=abc123def45' }
    ])
    assert.equal(items[0].poster, 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg')
    assert.equal(items[0].thumbnail, 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg')
  })

  it('prefers the upstream thumbnail as the video poster', () => {
    const items = normalizePreviews([
      { link: 'https://www.youtube.com/watch?v=abc123def45', thumbnail: 'https://example.com/thumb.jpg' }
    ])
    assert.equal(items[0].poster, 'https://example.com/thumb.jpg')
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
