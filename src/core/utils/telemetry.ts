import os from 'os'
import { Server as HttpServer } from 'http'
import { logger } from 'core/utils/logger'
import { RouteClass, ROUTE_CLASSES } from 'core/utils/routeClass'

/**
 * Lightweight process-wide telemetry for the HTTP request lifecycle and
 * MongoDB pool health. This exists so production capacity decisions (pool
 * sizing, caching, scaling) are driven by real numbers instead of guesses:
 *
 * - Gauges: active/peak requests, uptime, memory, load average.
 * - Counters: total served, 2xx/3xx/4xx/5xx, Mongo pool checkout
 *   (wait-queue) timeouts, Mongo server-selection errors.
 * - A ring buffer of recent request durations so p50/p95/p99 stay cheap and
 *   bounded (~4k samples, no unbounded growth).
 *
 * Exposed two ways:
 * - GET /metrics (Prometheus text format, wired in RouterServer).
 * - A periodic console log line (Docker captures it).
 */

export interface RouteStats {
  count: number
  durationSumMs: number
  durationMinMs: number
  durationMaxMs: number
}

function emptyRouteStats (): RouteStats {
  return { count: 0, durationSumMs: 0, durationMinMs: Number.POSITIVE_INFINITY, durationMaxMs: 0 }
}

export interface TelemetrySnapshot {
  uptimeSeconds: number
  activeRequests: number
  peakActiveRequests: number
  totalRequests: number
  mongoWaitQueueTimeouts: number
  mongoServerSelectionErrors: number
  cacheHits: number
  cacheMisses: number
  cacheBypasses: number
  cacheErrors: number
  cacheL1Hits: number
  cacheStaleHits: number
  cacheCoalescedWaits: number
  cacheRefreshes: number
  cacheRefreshFailures: number
  status2xx: number
  status3xx: number
  status4xx: number
  status5xx: number
  durationCount: number
  durationAvgMs: number
  durationMinMs: number
  durationMaxMs: number
  durationP50Ms: number
  durationP95Ms: number
  durationP99Ms: number
  routes: Record<RouteClass, RouteStats>
  staticRequests: number
  activeSockets: number
  eventLoopLagMs: number
  eventLoopLagMaxMs: number
}

const DURATION_SAMPLE_LIMIT = 4096
const startedAt = Date.now()

let activeRequests = 0
let peakActiveRequests = 0
let totalRequests = 0
let mongoWaitQueueTimeouts = 0
let mongoServerSelectionErrors = 0
let cacheHits = 0
let cacheMisses = 0
let cacheBypasses = 0
let cacheErrors = 0
let cacheL1Hits = 0
let cacheStaleHits = 0
let cacheCoalescedWaits = 0
let cacheRefreshes = 0
let cacheRefreshFailures = 0
let status2xx = 0
let status3xx = 0
let status4xx = 0
let status5xx = 0
let staticRequests = 0
let activeSockets = 0
let eventLoopLagMs = 0
let eventLoopLagMaxMs = 0
let loopMonitor: NodeJS.Timeout | null = null
let clusterSnapshot: TelemetrySnapshot | null = null

const routes: Record<RouteClass, RouteStats> = Object.fromEntries(
  ROUTE_CLASSES.map(cls => [cls, emptyRouteStats()])
) as Record<RouteClass, RouteStats>

// Bounded ring buffer of recent request durations for percentiles.
const durations: number[] = []
let durationSum = 0
let durationMin = Number.POSITIVE_INFINITY
let durationMax = 0

/** Record that a dynamic request entered the server (bucketed by route class). */
export function requestStart (routeClass: RouteClass = 'other'): void {
  activeRequests++
  totalRequests++
  if (activeRequests > peakActiveRequests) {
    peakActiveRequests = activeRequests
  }
  routes[routeClass].count++
}

/** Record a completed (accepted) request: duration, status class and route class. */
export function requestEnd (durationMs: number, statusCode: number, routeClass: RouteClass = 'other'): void {
  if (activeRequests > 0) {
    activeRequests--
  }

  if (statusCode < 300) {
    status2xx++
  } else if (statusCode < 400) {
    status3xx++
  } else if (statusCode < 500) {
    status4xx++
  } else {
    status5xx++
  }

  durations.push(durationMs)
  durationSum += durationMs
  if (durationMs < durationMin) {
    durationMin = durationMs
  }
  if (durationMs > durationMax) {
    durationMax = durationMs
  }
  if (durations.length > DURATION_SAMPLE_LIMIT) {
    const removed = durations.shift()
    if (removed !== undefined) {
      durationSum -= removed
      // An evicted sample can no longer define the window's min/max, so
      // recompute them to keep the reported range reflecting the current
      // bounded sample buffer instead of evicted values.
      if (removed === durationMin || removed === durationMax) {
        durationMin = Number.POSITIVE_INFINITY
        durationMax = 0
        for (const sample of durations) {
          if (sample < durationMin) {
            durationMin = sample
          }
          if (sample > durationMax) {
            durationMax = sample
          }
        }
      }
    }
  }

  const stats = routes[routeClass]
  stats.durationSumMs += durationMs
  if (durationMs < stats.durationMinMs) {
    stats.durationMinMs = durationMs
  }
  if (durationMs > stats.durationMaxMs) {
    stats.durationMaxMs = durationMs
  }
}

/** Record a MongoDB driver "timed out checking out a connection" error. */
export function recordMongoWaitQueueTimeout (): void {
  mongoWaitQueueTimeouts++
}

/** Record a MongoDB server-selection timeout. */
export function recordMongoServerSelectionError (): void {
  mongoServerSelectionErrors++
}

export function recordCacheHit (): void {
  cacheHits++
}

export function recordCacheMiss (): void {
  cacheMisses++
}

export function recordCacheBypass (): void {
  cacheBypasses++
}

export function recordCacheError (): void {
  cacheErrors++
}

export function recordCacheL1Hit (): void {
  cacheL1Hits++
}

export function recordCacheStaleHit (): void {
  cacheStaleHits++
}

export function recordCacheCoalescedWait (): void {
  cacheCoalescedWaits++
}

export function recordCacheRefresh (): void {
  cacheRefreshes++
}

export function recordCacheRefreshFailure (): void {
  cacheRefreshFailures++
}

/** Count a static file actually served from disk (wired into express.static setHeaders). */
export function recordStaticRequest (): void {
  staticRequests++
}

/**
 * Start measuring event-loop lag (delay between when a 1s timer is scheduled
 * and when it actually fires). A growing lag means the worker is blocked by
 * CPU-bound work and requests are queueing. Idempotent and unref'd.
 */
export function startEventLoopLagMonitor (intervalMs = 1000): void {
  if (loopMonitor !== null) return
  let last = process.hrtime.bigint()
  loopMonitor = setInterval(() => {
    const now = process.hrtime.bigint()
    const lagMs = Math.max(0, Number(now - last) / 1e6 - intervalMs)
    last = now
    eventLoopLagMs = lagMs
    if (lagMs > eventLoopLagMaxMs) eventLoopLagMaxMs = lagMs
  }, intervalMs)
  loopMonitor.unref()
}

export function stopEventLoopLagMonitor (): void {
  if (loopMonitor !== null) {
    clearInterval(loopMonitor)
    loopMonitor = null
  }
}

/**
 * Track open TCP sockets on the HTTP server (keep-alive connections count).
 * Wired once per worker from RouterServer.start.
 */
export function trackServerSockets (server: HttpServer): void {
  server.on('connection', (socket) => {
    activeSockets++
    socket.on('close', () => {
      if (activeSockets > 0) activeSockets--
    })
  })
}

/** Store the latest cluster-wide aggregate so /metrics can include it. */
export function setClusterSnapshot (snapshot: TelemetrySnapshot | null): void {
  clusterSnapshot = snapshot
}

export function getClusterSnapshot (): TelemetrySnapshot | null {
  return clusterSnapshot
}

/**
 * Sum per-worker snapshots into a cluster-wide view for /metrics. Counters are
 * summed, active/peak gauges take the max, and duration percentiles are
 * intentionally omitted (they are per-process; each process exposes its own).
 */
export function aggregateSnapshots (snapshots: TelemetrySnapshot[]): TelemetrySnapshot {
  const aggregatedRoutes = Object.fromEntries(
    ROUTE_CLASSES.map(cls => [cls, emptyRouteStats()])
  ) as Record<RouteClass, RouteStats>
  const result: TelemetrySnapshot = {
    uptimeSeconds: 0,
    activeRequests: 0,
    peakActiveRequests: 0,
    totalRequests: 0,
    mongoWaitQueueTimeouts: 0,
    mongoServerSelectionErrors: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheBypasses: 0,
    cacheErrors: 0,
    cacheL1Hits: 0,
    cacheStaleHits: 0,
    cacheCoalescedWaits: 0,
    cacheRefreshes: 0,
    cacheRefreshFailures: 0,
    status2xx: 0,
    status3xx: 0,
    status4xx: 0,
    status5xx: 0,
    durationCount: 0,
    durationAvgMs: 0,
    durationMinMs: 0,
    durationMaxMs: 0,
    durationP50Ms: 0,
    durationP95Ms: 0,
    durationP99Ms: 0,
    routes: aggregatedRoutes,
    staticRequests: 0,
    activeSockets: 0,
    eventLoopLagMs: 0,
    eventLoopLagMaxMs: 0
  }
  for (const s of snapshots) {
    result.activeRequests = Math.max(result.activeRequests, s.activeRequests)
    result.peakActiveRequests = Math.max(result.peakActiveRequests, s.peakActiveRequests)
    result.totalRequests += s.totalRequests
    result.mongoWaitQueueTimeouts += s.mongoWaitQueueTimeouts
    result.mongoServerSelectionErrors += s.mongoServerSelectionErrors
    result.cacheHits += s.cacheHits
    result.cacheMisses += s.cacheMisses
    result.cacheBypasses += s.cacheBypasses
    result.cacheErrors += s.cacheErrors
    result.cacheL1Hits += s.cacheL1Hits
    result.cacheStaleHits += s.cacheStaleHits
    result.cacheCoalescedWaits += s.cacheCoalescedWaits
    result.cacheRefreshes += s.cacheRefreshes
    result.cacheRefreshFailures += s.cacheRefreshFailures
    result.status2xx += s.status2xx
    result.status3xx += s.status3xx
    result.status4xx += s.status4xx
    result.status5xx += s.status5xx
    result.staticRequests += s.staticRequests
    result.activeSockets += s.activeSockets
    result.eventLoopLagMs = Math.max(result.eventLoopLagMs, s.eventLoopLagMs)
    result.eventLoopLagMaxMs = Math.max(result.eventLoopLagMaxMs, s.eventLoopLagMaxMs)
    for (const cls of ROUTE_CLASSES) {
      const target = result.routes[cls]
      const source = s.routes[cls]
      target.count += source.count
      target.durationSumMs += source.durationSumMs
      if (source.durationMinMs < target.durationMinMs) target.durationMinMs = source.durationMinMs
      if (source.durationMaxMs > target.durationMaxMs) target.durationMaxMs = source.durationMaxMs
    }
  }
  return result
}

function percentile (p: number): number {
  const count = durations.length
  if (count === 0) {
    return 0
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const index = Math.min(count - 1, Math.max(0, Math.ceil((p / 100) * count) - 1))
  return Math.round(sorted[index] ?? 0)
}

export function snapshot (): TelemetrySnapshot {
  const count = durations.length
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    activeRequests,
    peakActiveRequests,
    totalRequests,
    mongoWaitQueueTimeouts,
    mongoServerSelectionErrors,
    cacheHits,
    cacheMisses,
    cacheBypasses,
    cacheErrors,
    cacheL1Hits,
    cacheStaleHits,
    cacheCoalescedWaits,
    cacheRefreshes,
    cacheRefreshFailures,
    status2xx,
    status3xx,
    status4xx,
    status5xx,
    durationCount: count,
    durationAvgMs: count > 0 ? Math.round(durationSum / count) : 0,
    durationMinMs: Number.isFinite(durationMin) ? Math.round(durationMin) : 0,
    durationMaxMs: Math.round(durationMax),
    durationP50Ms: percentile(50),
    durationP95Ms: percentile(95),
    durationP99Ms: percentile(99),
    // Copy the per-class stats so a snapshot is immutable: callers (and
    // reset()) can never mutate a snapshot that another process/aggregator is
    // holding.
    routes: Object.fromEntries(
      ROUTE_CLASSES.map(cls => [cls, { ...routes[cls] }])
    ) as Record<RouteClass, RouteStats>,
    staticRequests,
    activeSockets,
    eventLoopLagMs,
    eventLoopLagMaxMs
  }
}

/** Render the snapshot as Prometheus exposition text. */
export function prometheusText (): string {
  const s = snapshot()
  const memory = process.memoryUsage()
  const load = os.loadavg()

  const lines: string[] = []
  const emit = (type: string, name: string, help: string, value: number): void => {
    lines.push(`# HELP ${name} ${help}`)
    lines.push(`# TYPE ${name} ${type}`)
    lines.push(`${name} ${value}`)
  }

  emit('gauge', 'http_active_requests', 'In-flight dynamic HTTP requests in this process', s.activeRequests)
  emit('gauge', 'http_peak_active_requests', 'Peak concurrent dynamic HTTP requests since boot', s.peakActiveRequests)
  emit('counter', 'http_requests_total', 'Total dynamic HTTP requests admitted to the server', s.totalRequests)
  emit('counter', 'http_requests_2xx_total', 'Responses with status 200-299', s.status2xx)
  emit('counter', 'http_requests_3xx_total', 'Responses with status 300-399', s.status3xx)
  emit('counter', 'http_requests_4xx_total', 'Responses with status 400-499', s.status4xx)
  emit('counter', 'http_requests_5xx_total', 'Responses with status 500-599', s.status5xx)
  emit('gauge', 'http_request_duration_avg_ms', 'Average recent request duration in ms', s.durationAvgMs)
  emit('gauge', 'http_request_duration_min_ms', 'Minimum recent request duration in ms', s.durationMinMs)
  emit('gauge', 'http_request_duration_max_ms', 'Maximum recent request duration in ms', s.durationMaxMs)
  emit('gauge', 'http_request_duration_p50_ms', 'Median recent request duration in ms', s.durationP50Ms)
  emit('gauge', 'http_request_duration_p95_ms', 'p95 recent request duration in ms', s.durationP95Ms)
  emit('gauge', 'http_request_duration_p99_ms', 'p99 recent request duration in ms', s.durationP99Ms)
  emit('counter', 'mongo_wait_queue_timeouts_total', 'MongoDB connection checkout (wait-queue) timeouts', s.mongoWaitQueueTimeouts)
  emit('counter', 'mongo_server_selection_errors_total', 'MongoDB server-selection errors', s.mongoServerSelectionErrors)
  emit('counter', 'cache_hits_total', 'Shared Dragonfly cache hits', s.cacheHits)
  emit('counter', 'cache_misses_total', 'Shared Dragonfly cache misses filled from the source', s.cacheMisses)
  emit('counter', 'cache_bypasses_total', 'Operations bypassing the shared cache while disabled or unavailable', s.cacheBypasses)
  emit('counter', 'cache_errors_total', 'Shared Dragonfly cache command or payload errors', s.cacheErrors)
  emit('counter', 'cache_l1_hits_total', 'Per-worker L1 cache hits', s.cacheL1Hits)
  emit('counter', 'cache_stale_hits_total', 'Responses served from stale-but-valid envelopes', s.cacheStaleHits)
  emit('counter', 'cache_coalesced_waits_total', 'Requests that awaited an in-flight load instead of running their own', s.cacheCoalescedWaits)
  emit('counter', 'cache_refreshes_total', 'Background stale-cache refreshes that completed', s.cacheRefreshes)
  emit('counter', 'cache_refresh_failures_total', 'Background stale-cache refreshes that failed (stale value kept)', s.cacheRefreshFailures)
  emit('gauge', 'process_uptime_seconds', 'Seconds since this process started', s.uptimeSeconds)
  emit('gauge', 'process_rss_bytes', 'Resident set size in bytes', memory.rss)
  emit('gauge', 'process_heap_used_bytes', 'V8 heap used in bytes', memory.heapUsed)
  emit('gauge', 'process_heap_total_bytes', 'V8 heap total in bytes', memory.heapTotal)
  emit('gauge', 'system_loadavg_1m', 'System load average over 1 minute', load[0])
  emit('gauge', 'system_loadavg_5m', 'System load average over 5 minutes', load[1])
  emit('gauge', 'system_loadavg_15m', 'System load average over 15 minutes', load[2])
  emit('counter', 'http_static_requests_total', 'Static files served from disk', s.staticRequests)
  emit('gauge', 'http_active_sockets', 'Open TCP sockets on this server', s.activeSockets)
  emit('gauge', 'http_event_loop_lag_ms', 'Latest event-loop lag in ms', s.eventLoopLagMs)
  emit('gauge', 'http_event_loop_lag_max_ms', 'Max event-loop lag in ms since boot', s.eventLoopLagMaxMs)

  // Bounded per-route-class traffic/latency.
  for (const cls of ROUTE_CLASSES) {
    const stats = s.routes[cls]
    emit('counter', `http_requests_${cls}_total`, `Requests classified as ${cls}`, stats.count)
    emit('counter', `http_request_duration_ms_${cls}_sum`, `Total response ms for ${cls} requests`, stats.durationSumMs)
    emit('gauge', `http_request_duration_ms_${cls}_avg`, `Average response ms for ${cls} requests`, stats.count > 0 ? Math.round(stats.durationSumMs / stats.count) : 0)
    emit('gauge', `http_request_duration_ms_${cls}_max`, `Max response ms for a ${cls} request`, Number.isFinite(stats.durationMaxMs) ? stats.durationMaxMs : 0)
  }

  // Cluster-wide view aggregated by the primary over IPC (present on every worker).
  if (clusterSnapshot !== null) {
    const c = clusterSnapshot
    emit('counter', 'http_cluster_requests_total', 'Aggregate requests across the whole cluster (primary IPC aggregation)', c.totalRequests)
    emit('gauge', 'http_cluster_active_requests', 'Aggregate in-flight requests across the cluster', c.activeRequests)
    emit('counter', 'http_cluster_2xx_total', 'Aggregate 2xx responses across the cluster', c.status2xx)
    emit('counter', 'http_cluster_4xx_total', 'Aggregate 4xx responses across the cluster', c.status4xx)
    emit('counter', 'http_cluster_5xx_total', 'Aggregate 5xx responses across the cluster', c.status5xx)
    emit('counter', 'http_cluster_cache_hits_total', 'Aggregate Dragonfly cache hits across the cluster', c.cacheHits)
    emit('counter', 'http_cluster_cache_stale_hits_total', 'Aggregate stale-cache serves across the cluster', c.cacheStaleHits)
    emit('counter', 'http_cluster_mongo_wait_queue_timeouts_total', 'Aggregate Mongo wait-queue timeouts across the cluster', c.mongoWaitQueueTimeouts)
    emit('counter', 'http_cluster_mongo_server_selection_errors_total', 'Aggregate Mongo server-selection errors across the cluster', c.mongoServerSelectionErrors)
    emit('gauge', 'http_cluster_event_loop_lag_max_ms', 'Max event-loop lag in ms across the cluster', c.eventLoopLagMaxMs)
  }

  return `${lines.join('\n')}\n`
}

/** Log a snapshot line so Docker captures it for capacity planning. */
export function logSummary (): void {
  logger.log('info', 'telemetry snapshot', snapshot())
}

let logInterval: NodeJS.Timeout | null = null

/**
 * Start a periodic telemetry log. Idempotent; the interval is unref'd so it
 * never keeps a standalone script or test process alive on its own.
 */
export function startPeriodicLogging (intervalMs: number): void {
  if (logInterval !== null) {
    return
  }
  logInterval = setInterval(() => {
    logSummary()
  }, intervalMs)
  logInterval.unref()
}

export function stopPeriodicLogging (): void {
  if (logInterval !== null) {
    clearInterval(logInterval)
    logInterval = null
  }
}

/** Reset all counters and samples (used by tests). */
export function reset (): void {
  activeRequests = 0
  peakActiveRequests = 0
  totalRequests = 0
  mongoWaitQueueTimeouts = 0
  mongoServerSelectionErrors = 0
  cacheHits = 0
  cacheMisses = 0
  cacheBypasses = 0
  cacheErrors = 0
  cacheL1Hits = 0
  cacheStaleHits = 0
  cacheCoalescedWaits = 0
  cacheRefreshes = 0
  cacheRefreshFailures = 0
  status2xx = 0
  status3xx = 0
  status4xx = 0
  status5xx = 0
  durations.length = 0
  durationSum = 0
  durationMin = Number.POSITIVE_INFINITY
  durationMax = 0
  staticRequests = 0
  activeSockets = 0
  eventLoopLagMs = 0
  eventLoopLagMaxMs = 0
  clusterSnapshot = null
  for (const cls of ROUTE_CLASSES) {
    routes[cls] = emptyRouteStats()
  }
}
