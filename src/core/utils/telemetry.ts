import os from 'os'
import { logger } from 'core/utils/logger'

/**
 * Lightweight process-wide telemetry for the HTTP request lifecycle and
 * MongoDB pool health. This exists so production capacity decisions (the
 * MAX_CONCURRENT_REQUESTS cap, MONGO_MAX_POOL, caching) are driven by real
 * numbers instead of guesses:
 *
 * - Gauges: active/peak requests, uptime, memory, load average.
 * - Counters: total served, rejected-by-cap, 2xx/3xx/4xx/5xx, Mongo pool
 *   checkout (wait-queue) timeouts, Mongo server-selection errors.
 * - A ring buffer of recent request durations so p50/p95/p99 stay cheap and
 *   bounded (~4k samples, no unbounded growth).
 *
 * Exposed two ways:
 * - GET /metrics (Prometheus text format, wired in RouterServer).
 * - A periodic console log line (Docker captures it).
 */

export interface TelemetrySnapshot {
  uptimeSeconds: number
  activeRequests: number
  peakActiveRequests: number
  totalRequests: number
  totalRejected: number
  rejectedByActiveCap: number
  mongoWaitQueueTimeouts: number
  mongoServerSelectionErrors: number
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
}

const DURATION_SAMPLE_LIMIT = 4096
const startedAt = Date.now()

let activeRequests = 0
let peakActiveRequests = 0
let totalRequests = 0
let totalRejected = 0
let rejectedByActiveCap = 0
let mongoWaitQueueTimeouts = 0
let mongoServerSelectionErrors = 0
let status2xx = 0
let status3xx = 0
let status4xx = 0
let status5xx = 0

// Bounded ring buffer of recent request durations for percentiles.
const durations: number[] = []
let durationSum = 0
let durationMin = Number.POSITIVE_INFINITY
let durationMax = 0

/** Record that a dynamic request entered the server (before the cap check). */
export function requestStart (): void {
  activeRequests++
  totalRequests++
  if (activeRequests > peakActiveRequests) {
    peakActiveRequests = activeRequests
  }
}

/** Record a completed (accepted) request: duration and response status class. */
export function requestEnd (durationMs: number, statusCode: number): void {
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
}

/**
 * Record a request rejected by the active-request cap (the 503 backstop).
 * Rejected requests never entered the active gauge (requestStart runs only
 * for admitted requests), so this only bumps the rejection counters.
 */
export function requestRejectedByActiveCap (): void {
  totalRejected++
  rejectedByActiveCap++
}

/** Record a MongoDB driver "timed out checking out a connection" error. */
export function recordMongoWaitQueueTimeout (): void {
  mongoWaitQueueTimeouts++
}

/** Record a MongoDB server-selection timeout. */
export function recordMongoServerSelectionError (): void {
  mongoServerSelectionErrors++
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
    totalRejected,
    rejectedByActiveCap,
    mongoWaitQueueTimeouts,
    mongoServerSelectionErrors,
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
    durationP99Ms: percentile(99)
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
  emit('counter', 'http_requests_rejected_total', 'Requests rejected before handling', s.totalRejected)
  emit('counter', 'http_requests_rejected_active_cap_total', 'Requests rejected by the active-request cap (503)', s.rejectedByActiveCap)
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
  emit('gauge', 'process_uptime_seconds', 'Seconds since this process started', s.uptimeSeconds)
  emit('gauge', 'process_rss_bytes', 'Resident set size in bytes', memory.rss)
  emit('gauge', 'process_heap_used_bytes', 'V8 heap used in bytes', memory.heapUsed)
  emit('gauge', 'process_heap_total_bytes', 'V8 heap total in bytes', memory.heapTotal)
  emit('gauge', 'system_loadavg_1m', 'System load average over 1 minute', load[0])
  emit('gauge', 'system_loadavg_5m', 'System load average over 5 minutes', load[1])
  emit('gauge', 'system_loadavg_15m', 'System load average over 15 minutes', load[2])

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
  totalRejected = 0
  rejectedByActiveCap = 0
  mongoWaitQueueTimeouts = 0
  mongoServerSelectionErrors = 0
  status2xx = 0
  status3xx = 0
  status4xx = 0
  status5xx = 0
  durations.length = 0
  durationSum = 0
  durationMin = Number.POSITIVE_INFINITY
  durationMax = 0
}
