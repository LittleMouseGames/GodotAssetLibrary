import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyCacheControl,
  isPubliclyCacheablePath,
  buildPublicCacheControl,
  PUBLIC_CACHE_POLICY
} from '../src/core/utils/httpCachePolicy'

function req (
  method: string,
  path: string,
  query: Record<string, unknown> = {},
  cookies: Record<string, unknown> = {}
): { method: string, path: string, query: Record<string, unknown>, cookies: Record<string, unknown> } {
  return { method, path, query, cookies }
}

describe('isPubliclyCacheablePath', () => {
  it('allows the canonical anonymous public views', () => {
    assert.equal(isPubliclyCacheablePath('GET', '/', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { page: '2' }), true)
    assert.equal(isPubliclyCacheablePath('GET', '/category/2d%20tools', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/category/2d%20tools', { page: '3' }), true)
    assert.equal(isPubliclyCacheablePath('GET', '/engine/3.4', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/asset/abc-123/my-slug', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/guides', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/guides/some-guide', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/guides/feed.xml', {}), true)
  })

  it('rejects search queries, filters, sort, limit and out-of-range pagination', () => {
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { q: 'shader' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { category: 'shaders' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { sort: 'asset_rating' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { limit: '24' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { page: '0' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { page: 'abc' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/search/', { page: '1001' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/category/2d%20tools', { sort: 'asset_rating' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/category/2d%20tools', { page: '0' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/engine/3.4', { q: 'x' }), false)
  })

  it('rejects request-specific asset and guide variants', () => {
    assert.equal(isPubliclyCacheablePath('GET', '/asset/abc-123/my-slug', { from: '/search/' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/asset/abc-123/my-slug', { reviews_page: '1' }), false)
    assert.equal(isPubliclyCacheablePath('GET', '/guides/some-guide', { foo: 'bar' }), false)
  })

  it('rejects non-GET/HEAD methods, unknown paths and protected namespaces', () => {
    assert.equal(isPubliclyCacheablePath('POST', '/', {}), false)
    assert.equal(isPubliclyCacheablePath('HEAD', '/', {}), true)
    assert.equal(isPubliclyCacheablePath('GET', '/foo', {}), false)
    assert.equal(isPubliclyCacheablePath('GET', '/dashboard', {}), false)
  })
})

describe('classifyCacheControl', () => {
  it('applies the aggressive public policy to eligible anonymous requests', () => {
    assert.equal(classifyCacheControl(req('GET', '/', {})), buildPublicCacheControl())
    assert.equal(classifyCacheControl(req('GET', '/asset/abc-123/my-slug', {})), buildPublicCacheControl())
    assert.equal(classifyCacheControl(req('GET', '/search/', { page: '2' })), buildPublicCacheControl())
  })

  it('keeps version-cookie requests browser-only, not shared', () => {
    assert.equal(classifyCacheControl(req('GET', '/', {}, { godot_version: '3' })), 'private, max-age=120')
  })

  it('marks authenticated requests private no-store', () => {
    assert.equal(classifyCacheControl(req('GET', '/', {}, { 'auth-token': 'tok' })), 'private, no-store')
  })

  it('keeps anonymous non-eligible GETs browser-only, not shared', () => {
    assert.equal(classifyCacheControl(req('GET', '/search/', { q: 'shader' })), 'private, max-age=120')
    assert.equal(classifyCacheControl(req('GET', '/foo', {})), 'private, max-age=120')
  })

  it('leaves non-GET/HEAD requests alone', () => {
    assert.equal(classifyCacheControl(req('POST', '/', {})), null)
    assert.equal(classifyCacheControl(req('PATCH', '/asset/x', {})), null)
  })
})

describe('buildPublicCacheControl', () => {
  it('emits the five-minute shared / 24h stale policy', () => {
    const out = buildPublicCacheControl()
    assert.ok(out.startsWith('public, max-age=60, s-maxage=300'), out)
    assert.ok(out.includes('stale-while-revalidate=300'), out)
    assert.ok(out.includes('stale-if-error=86400'), out)
    assert.equal(PUBLIC_CACHE_POLICY.sharedMaxAge, 300)
    assert.equal(PUBLIC_CACHE_POLICY.staleIfError, 86_400)
  })
})
