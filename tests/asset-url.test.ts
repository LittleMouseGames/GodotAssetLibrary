import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildAssetUrl, buildAssetUrlWithReturn, buildCardAnchor } from '../src/core/utils/assetUrl'

describe('assetUrl', () => {
  it('builds a canonical asset URL with a slug', () => {
    assert.equal(buildAssetUrl('abc123', 'My Cool Shader'), '/asset/abc123/my-cool-shader')
  })

  it('strips non-alphanumeric characters from the slug', () => {
    assert.equal(buildAssetUrl('abc123', 'Grass & Trees! (2D)'), '/asset/abc123/grass-trees-2d')
  })

  it('falls back to id-only URL for an empty title', () => {
    assert.equal(buildAssetUrl('abc123', ''), '/asset/abc123')
    assert.equal(buildAssetUrl('abc123', '   '), '/asset/abc123')
  })

  it('appends an encoded from parameter when a source URL is provided', () => {
    const url = buildAssetUrlWithReturn('abc123', 'Shader', '/search/?q=shader#asset-abc123')
    assert.equal(url, '/asset/abc123/shader?from=%2Fsearch%2F%3Fq%3Dshader%23asset-abc123')
  })

  it('omits the from parameter when absent', () => {
    assert.equal(buildAssetUrlWithReturn('abc123', 'Shader'), '/asset/abc123/shader')
  })

  it('builds stable card anchors', () => {
    assert.equal(buildCardAnchor('abc123'), 'asset-abc123')
  })
})
