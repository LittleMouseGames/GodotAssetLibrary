import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyRouteClass, ROUTE_CLASSES } from '../src/core/utils/routeClass'

describe('classifyRouteClass', () => {
  it('buckets state-changing methods as mutation', () => {
    assert.equal(classifyRouteClass('POST', '/'), 'mutation')
    assert.equal(classifyRouteClass('PATCH', '/asset/x'), 'mutation')
    assert.equal(classifyRouteClass('DELETE', '/dashboard/account'), 'mutation')
  })

  it('classifies public discovery routes', () => {
    assert.equal(classifyRouteClass('GET', '/'), 'homepage')
    assert.equal(classifyRouteClass('GET', '/health'), 'health')
    assert.equal(classifyRouteClass('GET', '/search/'), 'browse')
    assert.equal(classifyRouteClass('GET', '/search/', { page: '2' }), 'browse')
    assert.equal(classifyRouteClass('GET', '/search/', { q: 'shader' }), 'search')
    assert.equal(classifyRouteClass('GET', '/search/', { q: '  ' }), 'browse')
    assert.equal(classifyRouteClass('GET', '/category/2d%20tools'), 'browse')
    assert.equal(classifyRouteClass('GET', '/engine/3.4'), 'browse')
    assert.equal(classifyRouteClass('GET', '/asset/abc-123/my-slug'), 'asset')
    assert.equal(classifyRouteClass('GET', '/guides'), 'guides')
    assert.equal(classifyRouteClass('GET', '/guides/some-guide'), 'guides')
  })

  it('classifies account/auth/admin and falls back to other', () => {
    assert.equal(classifyRouteClass('GET', '/dashboard'), 'account')
    assert.equal(classifyRouteClass('GET', '/register'), 'account')
    assert.equal(classifyRouteClass('GET', '/api/users/login'), 'auth')
    assert.equal(classifyRouteClass('GET', '/admin'), 'admin')
    assert.equal(classifyRouteClass('GET', '/robots.txt'), 'other')
    assert.equal(classifyRouteClass('GET', '/some-custom-path'), 'other')
  })

  it('exposes a fixed bounded set of classes', () => {
    assert.ok(ROUTE_CLASSES.length > 0)
    assert.ok(ROUTE_CLASSES.includes('homepage'))
    assert.ok(ROUTE_CLASSES.includes('search'))
  })
})
