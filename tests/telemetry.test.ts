import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  snapshot,
  requestStart,
  requestEnd,
  recordMongoWaitQueueTimeout,
  recordMongoServerSelectionError,
  recordCacheHit,
  recordCacheMiss,
  recordCacheBypass,
  recordCacheError,
  recordStaticRequest,
  setClusterSnapshot,
  aggregateSnapshots,
  prometheusText,
  reset
} from '../src/core/utils/telemetry'

describe('telemetry', () => {
  it('tracks active and peak requests across start/end', () => {
    reset()
    requestStart()
    requestStart()
    assert.equal(snapshot().activeRequests, 2)
    assert.equal(snapshot().peakActiveRequests, 2)
    assert.equal(snapshot().totalRequests, 2)

    requestEnd(10, 200)
    assert.equal(snapshot().activeRequests, 1)
    assert.equal(snapshot().peakActiveRequests, 2)
    assert.equal(snapshot().status2xx, 1)

    requestEnd(20, 404)
    assert.equal(snapshot().activeRequests, 0)
    assert.equal(snapshot().status4xx, 1)
  })

  it('computes duration percentiles and average', () => {
    reset()
    // Ten samples of 1..10 ms.
    for (let i = 1; i <= 10; i++) {
      requestStart()
      requestEnd(i, 200)
    }
    const s = snapshot()
    assert.equal(s.durationCount, 10)
    assert.equal(s.durationMinMs, 1)
    assert.equal(s.durationMaxMs, 10)
    assert.equal(s.durationAvgMs, Math.round(55 / 10))
    assert.ok(s.durationP50Ms >= 5 && s.durationP50Ms <= 6)
    assert.equal(s.durationP95Ms, 10)
    assert.equal(s.durationP99Ms, 10)
  })

  it('recomputes min/max when an evicted sample defined them', () => {
    reset()
    // Fill the bounded ring buffer (DURATION_SAMPLE_LIMIT = 4096) with one
    // value, then push values whose insertion evicts the original min/max so
    // they must be recomputed from the remaining window.
    for (let i = 0; i < 4096; i++) {
      requestStart()
      requestEnd(5, 200)
    }
    requestStart()
    requestEnd(1, 200) // evicts a 5 -> min becomes 1
    requestStart()
    requestEnd(100, 200) // evicts a 5 -> max becomes 100
    const s = snapshot()
    assert.equal(s.durationCount, 4096)
    assert.equal(s.durationMinMs, 1)
    assert.equal(s.durationMaxMs, 100)
  })

  it('counts MongoDB pool health errors separately', () => {
    reset()
    recordMongoWaitQueueTimeout()
    recordMongoWaitQueueTimeout()
    recordMongoServerSelectionError()
    const s = snapshot()
    assert.equal(s.mongoWaitQueueTimeouts, 2)
    assert.equal(s.mongoServerSelectionErrors, 1)
  })

  it('counts shared cache outcomes separately', () => {
    reset()
    recordCacheHit()
    recordCacheHit()
    recordCacheMiss()
    recordCacheBypass()
    recordCacheError()
    const s = snapshot()
    assert.equal(s.cacheHits, 2)
    assert.equal(s.cacheMisses, 1)
    assert.equal(s.cacheBypasses, 1)
    assert.equal(s.cacheErrors, 1)
  })

  it('renders Prometheus text with expected metric names', () => {
    reset()
    requestStart()
    requestEnd(5, 200)
    const text = prometheusText()
    assert.match(text, /# TYPE http_active_requests gauge/)
    assert.match(text, /# TYPE http_requests_total counter/)
    assert.match(text, /http_requests_total 1/)
    assert.match(text, /http_request_duration_p95_ms 5/)
    assert.match(text, /mongo_wait_queue_timeouts_total 0/)
    assert.match(text, /cache_hits_total 0/)
  })

  it('tracks per-route-class traffic and latency', () => {
    reset()
    requestStart('homepage')
    requestEnd(10, 200, 'homepage')
    requestStart('search')
    requestEnd(250, 200, 'search')
    const s = snapshot()
    assert.equal(s.routes.homepage.count, 1)
    assert.equal(s.routes.homepage.durationSumMs, 10)
    assert.equal(s.routes.search.count, 1)
    assert.equal(s.routes.search.durationSumMs, 250)
    // The no-arg default bucket is 'other'.
    assert.equal(s.routes.other.count, 0)
  })

  it('counts static file serves', () => {
    reset()
    recordStaticRequest()
    recordStaticRequest()
    assert.equal(snapshot().staticRequests, 2)
  })

  it('aggregates worker snapshots into a cluster view', () => {
    reset()
    requestStart('homepage')
    requestEnd(10, 200, 'homepage')
    const a = snapshot()
    reset()
    requestStart('search')
    requestEnd(20, 404, 'search')
    const b = snapshot()
    const cluster = aggregateSnapshots([a, b])
    assert.equal(cluster.totalRequests, 2)
    assert.equal(cluster.routes.homepage.count, 1)
    assert.equal(cluster.routes.search.count, 1)
    assert.equal(cluster.status2xx, 1)
    assert.equal(cluster.status4xx, 1)
  })

  it('sums the active-request gauge across workers', () => {
    reset()
    requestStart('homepage')
    requestStart('asset')
    const a = snapshot()
    reset()
    requestStart('search')
    const b = snapshot()
    const cluster = aggregateSnapshots([a, b])
    assert.equal(cluster.activeRequests, 3)
    reset()
  })

  it('renders route-class, static and cluster metrics in Prometheus text', () => {
    reset()
    requestStart('homepage')
    requestEnd(5, 200, 'homepage')
    recordStaticRequest()
    const perProcess = prometheusText()
    assert.match(perProcess, /http_requests_homepage_total 1/)
    assert.match(perProcess, /http_static_requests_total 1/)
    assert.match(perProcess, /http_active_sockets/)
    assert.match(perProcess, /http_event_loop_lag_ms/)
    // The cluster block appears once a cluster snapshot is stored.
    setClusterSnapshot(aggregateSnapshots([snapshot()]))
    const withCluster = prometheusText()
    assert.match(withCluster, /http_cluster_requests_total 1/)
    assert.match(withCluster, /http_cluster_2xx_total 1/)
    reset()
  })
})
