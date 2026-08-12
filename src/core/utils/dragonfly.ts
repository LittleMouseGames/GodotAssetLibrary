import { createClient, RedisClientType } from 'redis'
import { randomBytes } from 'crypto'
import { logger } from 'core/utils/logger'
import * as telemetry from 'core/utils/telemetry'

type DragonflyClient = RedisClientType

const DEFAULT_URL = 'redis://dragonfly:6379'
const CONNECT_TIMEOUT_MS = 1000
const COMMAND_TIMEOUT_MS = 750
const RECONNECT_DELAY_MS = 10_000
const DEFAULT_LOCK_MS = 5000
const DEFAULT_WAIT_MS = 1500

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
    next.on('error', () => {
      // Cache failures are handled as misses. Avoid logging every client event
      // while Dragonfly is unavailable; the connection attempt logs once.
    })

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

export async function cacheGetJson<T> (key: string): Promise<T | null> {
  const raw = await cacheCommand(async connected => await connected.get(key))
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    telemetry.recordCacheError()
    void cacheDelete(key)
    return null
  }
}

export async function cacheSetJson (key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return false
  const stored = await cacheCommand(async connected => await connected.set(key, JSON.stringify(value), { EX: Math.ceil(ttlSeconds) }))
  return stored === 'OK'
}

export async function cacheDelete (...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await cacheCommand(async connected => await connected.del(keys))
}

export async function cacheGetOrLoad<T> (
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  lockMs = DEFAULT_LOCK_MS
): Promise<{ value: T, hit: boolean }> {
  const cached = await cacheGetJson<T>(key)
  if (cached !== null) {
    telemetry.recordCacheHit()
    return { value: cached, hit: true }
  }

  const connected = await getClient()
  if (connected === null) {
    telemetry.recordCacheMiss()
    return { value: await loader(), hit: false }
  }

  const lockKey = `${key}:lock`
  const lockToken = `${process.pid}:${randomBytes(8).toString('hex')}`
  const acquired = await cacheCommand(async current => await current.set(lockKey, lockToken, { NX: true, PX: lockMs }))

  if (acquired === 'OK') {
    try {
      const value = await loader()
      await cacheSetJson(key, value, ttlSeconds)
      telemetry.recordCacheMiss()
      return { value, hit: false }
    } finally {
      const currentLock = await cacheCommand(async current => await current.get(lockKey))
      if (currentLock === lockToken) await cacheDelete(lockKey)
    }
  }

  // Another worker is filling this key. Wait briefly for its result instead
  // of stampeding MongoDB, but never make Dragonfly a hard dependency.
  const deadline = Date.now() + Math.min(DEFAULT_WAIT_MS, lockMs)
  while (Date.now() < deadline) {
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 25)
      timer.unref()
    })
    const filled = await cacheGetJson<T>(key)
    if (filled !== null) {
      telemetry.recordCacheHit()
      return { value: filled, hit: true }
    }
  }

  telemetry.recordCacheMiss()
  return { value: await loader(), hit: false }
}

/**
 * Cache key for a public asset (PDP) page bundle. Shared by the render path
 * and by the mutation paths that invalidate it after a review or admin change.
 */
export function buildAssetCacheKey (assetId: string): string {
  return `gda:v1:asset:${assetId}`
}

/**
 * Cache key for an authenticated user's login context (loggedIn + role),
 * derived from the hashed resume token. Invalidated on logout and account
 * deletion so a revoked session never outlives its short TTL.
 */
export function buildUserContextCacheKey (hashedToken: string): string {
  return `gda:v1:userctx:${hashedToken}`
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
