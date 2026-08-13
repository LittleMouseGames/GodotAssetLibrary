import { createClient, RedisClientType } from 'redis'
import { randomBytes } from 'crypto'
import { logger } from 'core/utils/logger'
import * as telemetry from 'core/utils/telemetry'
import { GODOT_MAJOR_CACHE_VARIANTS, godotMajorCacheSuffix } from 'core/utils/godotVersionPreference'

type DragonflyClient = RedisClientType

const DEFAULT_URL = 'redis://dragonfly:6379'
const CONNECT_TIMEOUT_MS = 1000
const COMMAND_TIMEOUT_MS = 750
const RECONNECT_DELAY_MS = 10_000
const ENVELOPE_VERSION = 2
const DEFAULT_LOCK_MS = 5000
const DEFAULT_STALE_TTL_SECONDS = 86_400

const parsedWaitMs = Number.parseInt(process.env.CACHE_COALESCE_WAIT_MS ?? '', 10)
const DEFAULT_WAIT_MS = Number.isFinite(parsedWaitMs) && parsedWaitMs > 0 ? parsedWaitMs : 3000

const parsedL1Bytes = Number.parseInt(process.env.CACHE_L1_BYTES ?? '', 10)
const L1_MAX_BYTES = Number.isFinite(parsedL1Bytes) && parsedL1Bytes > 0 ? parsedL1Bytes : 32 * 1024 * 1024
const parsedL1Entries = Number.parseInt(process.env.CACHE_L1_MAX_ENTRIES ?? '', 10)
const L1_MAX_ENTRIES = Number.isFinite(parsedL1Entries) && parsedL1Entries > 0 ? parsedL1Entries : 2000

let client: DragonflyClient | null = null
let connectPromise: Promise<DragonflyClient | null> | null = null
let lastConnectAttemptAt = 0

function isEnabled (): boolean {
  return process.env.CACHE_ENABLED !== 'false'
}

function cacheUrl (): string {
  const configured = process.env.DRAGONFLY_URL?.trim()
  return configured !== undefined && configured !== '' ? configured : DEFAULT_URL
}

async function withTimeout<T> (operation: Promise<T>, timeoutMs = COMMAND_TIMEOUT_MS): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Dragonfly command timed out after ${timeoutMs}ms`)), timeoutMs)
    timer.unref()
    operation.then(value => {
      clearTimeout(timer)
      resolve(value)
    }).catch(error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function getClient (): Promise<DragonflyClient | null> {
  if (!isEnabled()) return null
  if (client?.isReady === true) return client
  if (connectPromise !== null) return await connectPromise

  const now = Date.now()
  if (now - lastConnectAttemptAt < RECONNECT_DELAY_MS) return null
  lastConnectAttemptAt = now

  connectPromise = (async () => {
    const next = createClient({
      url: cacheUrl(),
      socket: {
        connectTimeout: CONNECT_TIMEOUT_MS,
        reconnectStrategy: false
      }
    }) as DragonflyClient
    const markDead = (): void => {
      // Only the active client clears itself; a late event from an older
      // client must never clobber a newer, healthy reference.
      if (client === next) client = null
    }
    // Cache failures are handled as misses. When the connection drops, clear
    // the module reference so the next call reconnects cleanly; the initial
    // connect attempt logs the one-time "unavailable" warning.
    next.on('end', markDead)
    next.on('error', markDead)

    try {
      await next.connect()
      client = next
      logger.log('info', 'Connected to Dragonfly cache')
      return next
    } catch (error: any) {
      logger.log('warn', `Dragonfly unavailable; continuing without shared cache: ${error?.message ?? error}`)
      if (next.isOpen) await next.disconnect()
      return null
    } finally {
      connectPromise = null
    }
  })()

  return await connectPromise
}

async function cacheCommand<T> (operation: (connected: DragonflyClient) => Promise<T>): Promise<T | null> {
  const connected = await getClient()
  if (connected === null) {
    telemetry.recordCacheBypass()
    return null
  }

  try {
    return await withTimeout(operation(connected))
  } catch {
    telemetry.recordCacheError()
    return null
  }
}

export interface CacheEnvelope<T> {
  v: number
  value: T
  freshUntil: number
  staleUntil: number
}

/** Build a fresh+stale envelope with the given source TTLs (ms). */
export function buildEnvelope<T> (value: T, freshTtlMs: number, staleTtlMs: number, now = Date.now()): CacheEnvelope<T> {
  const freshUntil = now + freshTtlMs
  const staleUntil = now + freshTtlMs + staleTtlMs
  return { v: ENVELOPE_VERSION, value, freshUntil, staleUntil }
}

/** True while the envelope is still within its freshness window. */
export function isEnvelopeFresh<T> (envelope: CacheEnvelope<T>, now = Date.now()): boolean {
  return now < envelope.freshUntil
}

/** True when the envelope may still be served as stale (past fresh, before hard stale). */
export function isEnvelopeStaleServable<T> (envelope: CacheEnvelope<T>, now = Date.now()): boolean {
  return envelope.freshUntil <= now && now < envelope.staleUntil
}

function defaultStaleTtlSeconds (): number {
  const parsed = Number.parseInt(process.env.CACHE_STALE_TTL_SECONDS ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STALE_TTL_SECONDS
}

/**
 * Per-worker byte-bounded L1 cache. Every request looks here first, and it
 * survives a Dragonfly outage, so a small bounded L1 shrinks the blast radius
 * when the shared cache fails. The budget is bounded per worker
 * (CACHE_L1_BYTES) so duplicated L1 memory across workers stays predictable.
 */
interface L1Entry {
  envelope: CacheEnvelope<unknown>
  bytes: number
}

const l1 = new Map<string, L1Entry>()
let l1Bytes = 0

function l1Delete (key: string): void {
  const entry = l1.get(key)
  if (entry !== undefined) {
    l1Bytes -= entry.bytes
    l1.delete(key)
  }
}

function l1Get<T> (key: string, now: number, allowStale: boolean): CacheEnvelope<T> | null {
  const entry = l1.get(key)
  if (entry === undefined) return null
  const envelope = entry.envelope as CacheEnvelope<T>
  if (isEnvelopeFresh(envelope, now) || (allowStale && isEnvelopeStaleServable(envelope, now))) {
    // LRU touch: move to the back of the Map (most recently used).
    l1.delete(key)
    l1.set(key, entry)
    return envelope
  }
  l1Delete(key)
  return null
}

function l1Set<T> (key: string, envelope: CacheEnvelope<T>): void {
  const bytes = Buffer.byteLength(key, 'utf8') + Buffer.byteLength(JSON.stringify(envelope), 'utf8')
  l1Delete(key)
  l1.set(key, { envelope: envelope as CacheEnvelope<unknown>, bytes })
  l1Bytes += bytes
  // Evict oldest entries until under the byte and entry budgets.
  while ((l1Bytes > L1_MAX_BYTES || l1.size > L1_MAX_ENTRIES) && l1.size > 0) {
    const oldestKey = l1.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    l1Delete(oldestKey)
  }
}

export async function cacheDelete (...keys: string[]): Promise<void> {
  for (const key of keys) l1Delete(key)
  if (keys.length === 0) return
  await cacheCommand(async connected => await connected.del(keys))
}

async function cacheGetEnvelope<T> (key: string): Promise<CacheEnvelope<T> | null> {
  const raw = await cacheCommand(async connected => await connected.get(key))
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (parsed === null || typeof parsed !== 'object' || parsed.v !== ENVELOPE_VERSION ||
        typeof parsed.freshUntil !== 'number' || typeof parsed.staleUntil !== 'number') {
      // Old-format (pre-envelope) entries are dropped and re-filled on demand.
      void cacheDelete(key)
      return null
    }
    return parsed
  } catch {
    telemetry.recordCacheError()
    void cacheDelete(key)
    return null
  }
}

async function cacheSetEnvelope<T> (key: string, envelope: CacheEnvelope<T>): Promise<boolean> {
  const ttlMs = envelope.staleUntil - Date.now()
  if (ttlMs <= 0) return false
  const stored = await cacheCommand(async connected =>
    await connected.set(key, JSON.stringify(envelope), { EX: Math.ceil(ttlMs / 1000) })
  )
  return stored === 'OK'
}

// Atomic compare-and-delete so an expired/replaced lock can never be deleted
// by a previous owner (the old GET-then-DEL raced and could delete a new
// owner's lock).
const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`

async function releaseLock (lockKey: string, token: string): Promise<void> {
  await cacheCommand(async connected => await connected.eval(RELEASE_LOCK_SCRIPT, {
    keys: [lockKey],
    arguments: [token]
  }))
}

async function sleepJittered (baseMs: number): Promise<void> {
  const jitter = Math.floor(Math.random() * baseMs * 0.5)
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, baseMs + jitter)
    timer.unref()
  })
}

async function safeEpoch (read: () => Promise<string | null>): Promise<string | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

export interface CacheGetOrLoadOptions {
  /** Distributed lock TTL for one fill (ms). */
  lockMs?: number
  /** How long followers wait for another worker's cold fill before loading themselves (ms). */
  waitMs?: number
  /** How long past freshness a value stays servable as stale (seconds). 0 disables stale serving. */
  staleTtlSeconds?: number
  /**
   * Optional source fence. When the epoch changes between the pre-load read and
   * the post-load read, the write is skipped so an older in-flight loader can
   * never repopulate the cache after an invalidation.
   */
  epoch?: () => Promise<string | null>
}

// Per-process single-flight: while one request loads a key, every other
// request in this worker awaits the same promise instead of re-running the
// loader. Together with the distributed lock this prevents cache stampedes.
const inflight = new Map<string, Promise<{ value: any, hit: boolean }>>()
const refreshing = new Set<string>()

/**
 * Load a value from the two-level cache: bounded per-worker L1, then Dragonfly.
 *
 * Public snapshots stay fresh for `ttlSeconds` and then remain servable as
 * stale (returned immediately while one owner refreshes in the background) for
 * the stale window, so an origin/database failure serves the last known good
 * value instead of failing every request. Fail-open: any Dragonfly problem
 * degrades to loading the source directly.
 */
export async function cacheGetOrLoad<T> (
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  lockMs = DEFAULT_LOCK_MS,
  options: CacheGetOrLoadOptions = {}
): Promise<{ value: T, hit: boolean }> {
  const now = Date.now()
  const freshTtlMs = ttlSeconds * 1000
  const staleTtlSeconds = options.staleTtlSeconds ?? defaultStaleTtlSeconds()
  const staleTtlMs = staleTtlSeconds > 0 ? staleTtlSeconds * 1000 : 0
  const allowStale = staleTtlMs > 0
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS

  // L1 serves regardless of Dragonfly state (survives an outage).
  const l1Entry = l1Get<T>(key, now, allowStale)
  if (l1Entry !== null) {
    telemetry.recordCacheL1Hit()
    telemetry.recordCacheHit()
    if (allowStale && isEnvelopeStaleServable(l1Entry, now)) {
      telemetry.recordCacheStaleHit()
      refreshInBackground(key, freshTtlMs, staleTtlMs, loader, lockMs, options)
    }
    return { value: l1Entry.value, hit: true }
  }

  const connected = await getClient()
  if (connected === null) {
    telemetry.recordCacheBypass()
    telemetry.recordCacheMiss()
    return { value: await loader(), hit: false }
  }

  const envelope = await cacheGetEnvelope<T>(key)
  if (envelope !== null && isEnvelopeFresh(envelope, now)) {
    l1Set(key, envelope)
    telemetry.recordCacheHit()
    return { value: envelope.value, hit: true }
  }
  if (envelope !== null && allowStale && isEnvelopeStaleServable(envelope, now)) {
    l1Set(key, envelope)
    telemetry.recordCacheHit()
    telemetry.recordCacheStaleHit()
    refreshInBackground(key, freshTtlMs, staleTtlMs, loader, lockMs, options)
    return { value: envelope.value, hit: true }
  }

  const pending = inflight.get(key)
  if (pending !== undefined) {
    telemetry.recordCacheCoalescedWait()
    const result = await pending
    telemetry.recordCacheHit()
    return { value: result.value, hit: true }
  }

  const load = loadValue(key, freshTtlMs, staleTtlMs, allowStale, loader, lockMs, waitMs, options)
  inflight.set(key, load)
  try {
    return await load
  } finally {
    inflight.delete(key)
  }
}

async function loadValue<T> (
  key: string,
  freshTtlMs: number,
  staleTtlMs: number,
  allowStale: boolean,
  loader: () => Promise<T>,
  lockMs: number,
  waitMs: number,
  options: CacheGetOrLoadOptions
): Promise<{ value: T, hit: boolean }> {
  const lockKey = `${key}:lock`
  const lockToken = `${process.pid}:${randomBytes(8).toString('hex')}`
  const acquired = await cacheCommand(async current =>
    await current.set(lockKey, lockToken, { NX: true, PX: lockMs })
  )

  if (acquired === 'OK') {
    try {
      const epochBefore = options.epoch !== undefined ? await safeEpoch(options.epoch) : null
      const value = await loader()
      const epochAfter = options.epoch !== undefined ? await safeEpoch(options.epoch) : null
      if (epochBefore === null || epochAfter === null || epochBefore === epochAfter) {
        const envelope = buildEnvelope(value, freshTtlMs, staleTtlMs)
        l1Set(key, envelope)
        await cacheSetEnvelope(key, envelope)
      }
      telemetry.recordCacheMiss()
      return { value, hit: false }
    } finally {
      await releaseLock(lockKey, lockToken)
    }
  }

  // Another worker holds the fill lock: poll with jittered backoff for its
  // result instead of stampeding the source. Fall through only after the
  // bounded wait so a genuine cold fill under pressure still completes.
  telemetry.recordCacheCoalescedWait()
  const deadline = Date.now() + waitMs
  let baseDelay = 50
  while (Date.now() < deadline) {
    await sleepJittered(baseDelay)
    const filled = await cacheGetEnvelope<T>(key)
    if (filled !== null && (isEnvelopeFresh(filled) || (allowStale && isEnvelopeStaleServable(filled)))) {
      l1Set(key, filled)
      telemetry.recordCacheHit()
      return { value: filled.value, hit: true }
    }
    baseDelay = Math.min(baseDelay * 1.8, 300)
  }

  telemetry.recordCacheMiss()
  return { value: await loader(), hit: false }
}

/**
 * Kick off a single-flight background refresh for a key that was served stale.
 * The current request returns stale immediately; the refresh (bounded by the
 * distributed lock) re-populates fresh data. On failure the stale value is
 * kept and served again. Errors never reach callers.
 */
function refreshInBackground<T> (
  key: string,
  freshTtlMs: number,
  staleTtlMs: number,
  loader: () => Promise<T>,
  lockMs: number,
  options: CacheGetOrLoadOptions
): void {
  if (refreshing.has(key)) return
  refreshing.add(key)
  void (async () => {
    try {
      const connected = await getClient()
      if (connected === null) return
      const lockKey = `${key}:lock`
      const lockToken = `${process.pid}:${randomBytes(8).toString('hex')}`
      const acquired = await cacheCommand(async current =>
        await current.set(lockKey, lockToken, { NX: true, PX: lockMs })
      )
      if (acquired !== 'OK') return
      try {
        const epochBefore = options.epoch !== undefined ? await safeEpoch(options.epoch) : null
        const value = await loader()
        const epochAfter = options.epoch !== undefined ? await safeEpoch(options.epoch) : null
        if (epochBefore === null || epochAfter === null || epochBefore === epochAfter) {
          const envelope = buildEnvelope(value, freshTtlMs, staleTtlMs)
          l1Set(key, envelope)
          await cacheSetEnvelope(key, envelope)
        }
        telemetry.recordCacheRefresh()
      } catch {
        telemetry.recordCacheRefreshFailure()
      } finally {
        await releaseLock(lockKey, lockToken)
      }
    } catch {
      telemetry.recordCacheRefreshFailure()
    } finally {
      refreshing.delete(key)
    }
  })()
}

/**
 * Cache key for a public asset (PDP) page bundle. Partitioned by the visitor's
 * pinned Godot major because the cached bundle includes related-asset cards,
 * which are major-filtered. Old `gda:v1:asset:*` keys are never read by the
 * new code and expire naturally.
 */
export function buildAssetCacheKey (assetId: string, major: number | undefined): string {
  return `gda:v2:asset:${assetId}:${godotMajorCacheSuffix(major)}`
}

/**
 * Every PDP cache variant for an asset. Review/admin mutations invalidate all
 * of them so a fresh rating or report is reflected for every pinned major.
 */
export function buildAllAssetCacheKeys (assetId: string): string[] {
  return GODOT_MAJOR_CACHE_VARIANTS.map(major => buildAssetCacheKey(assetId, major))
}

/**
 * Cache key for an authenticated user's login context (loggedIn + role),
 * derived from the hashed resume token. Invalidated on logout and account
 * deletion so a revoked session never outlives its short TTL.
 */
export function buildUserContextCacheKey (hashedToken: string): string {
  return `gda:v1:userctx:${hashedToken}`
}

const ASSET_EPOCH_PREFIX = 'gda:v2:assetepoch:'
const HOMEPAGE_PREFIX = 'gda:v2:homepage:'
const HOMEPAGE_EPOCH_PREFIX = 'gda:v2:homepageepoch:'

/** Per-asset mutation generation key used to fence in-flight cache fills. */
export function buildAssetEpochKey (assetId: string): string {
  return `${ASSET_EPOCH_PREFIX}${assetId}`
}

/**
 * Homepage snapshot cache key, partitioned by the pinned Godot major (the
 * hero + sections are major-filtered, so visitors must never share section
 * data across majors).
 */
export function buildHomepageCacheKey (major: number | undefined): string {
  return `${HOMEPAGE_PREFIX}${godotMajorCacheSuffix(major)}`
}

/** Every homepage cache variant, used to invalidate all majors at once. */
export function buildAllHomepageCacheKeys (): string[] {
  return GODOT_MAJOR_CACHE_VARIANTS.map(major => buildHomepageCacheKey(major))
}

/** Global homepage mutation-generation key (fences in-flight snapshot loads). */
export function buildHomepageEpochKey (): string {
  return `${HOMEPAGE_EPOCH_PREFIX}global`
}

/**
 * Read the current homepage mutation generation. Returns null when no
 * mutation has ever occurred or the cache is unavailable (fail-open).
 */
export async function getHomepageEpoch (): Promise<string | null> {
  return await cacheCommand(async connected => await connected.get(buildHomepageEpochKey()))
}

/** Drop every homepage variant from this worker's L1 only (no broadcast). */
export function invalidateHomepageCacheLocally (): void {
  for (const key of buildAllHomepageCacheKeys()) l1Delete(key)
}

/**
 * Invalidate every homepage cache variant and bump the homepage epoch first,
 * so an older in-flight snapshot load that started before this mutation
 * cannot repopulate the cache with stale curation (the fence skips its write
 * because the epoch changed under it). Fails open when Dragonfly is down; the
 * bounded TTL bounds residual staleness. Used after feature/order/source
 * mutations that change hero slides.
 */
export async function invalidateHomepageCache (): Promise<void> {
  await cacheCommand(async connected => await connected.incr(buildHomepageEpochKey()))
  invalidateHomepageCacheLocally()
  await cacheDelete(...buildAllHomepageCacheKeys())
  // Tell the primary to broadcast the local invalidation to every worker so
  // their L1 caches drop too (each worker's L1 is independent).
  if (process.send !== undefined) {
    process.send({ type: 'invalidate-homepage-cache' })
  }
}

/**
 * Read the current mutation generation for an asset. Returns null when no
 * mutation has ever occurred or the cache is unavailable (fail-open).
 */
export async function getAssetEpoch (assetId: string): Promise<string | null> {
  return await cacheCommand(async connected => await connected.get(buildAssetEpochKey(assetId)))
}

/**
 * Invalidate every PDP cache variant for an asset and bump its mutation
 * generation first, so an older in-flight loader that started before this
 * mutation cannot repopulate the cache with stale data (the fence skips its
 * write because the epoch changed under it). Fail-open: if Dragonfly is down
 * the delete is a no-op and the bounded TTL bounds any residual staleness.
 */
export async function invalidateAssetCache (assetId: string): Promise<void> {
  await cacheCommand(async connected => await connected.incr(buildAssetEpochKey(assetId)))
  const variants = buildAllAssetCacheKeys(assetId)
  for (const variant of variants) l1Delete(variant)
  await cacheDelete(...variants)
}

export async function disconnectDragonfly (): Promise<void> {
  const connected = client
  client = null
  if (connected?.isOpen === true) {
    try {
      await connected.quit()
    } catch {
      void connected.disconnect()
    }
  }
}
