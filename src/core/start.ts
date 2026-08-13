import cluster from 'cluster'
import http from 'http'
import RouterServer from 'core/RouterServer'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import * as cronJobs from 'core/jobs.index'
import * as telemetry from 'core/utils/telemetry'
import { ensureIndexes } from 'core/ensureIndexes'
import { runMigrations } from 'core/migrations'
import { runGenerateSitemap } from 'app/utilities/sitemapGenerator/jobs/generateSitemap'
import { getWorkerCount } from 'core/utils/clusterConfig'
import { invalidateSiteFileCacheLocally, primeSiteFilesCache } from 'core/utils/siteFiles'
import { disconnectDragonfly } from 'core/utils/dragonfly'

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
  process.exit(1)
})

/** Read a positive drain timeout (ms) from an env var, falling back when unset/invalid. */
function parseDrainTimeout (value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Node cluster: the PRIMARY process does the one-time bootstrap (Mongo
// connect, migrations, index checks, sitemap), runs every cron job exactly
// once, and supervises the HTTP workers. Each WORKER is its own Node process
// that just connects to MongoDB and serves HTTP, so the app can use every CPU
// core instead of the single thread of one process. This is what lets prod
// absorb the load that used to saturate one process and trip the 503 cap.
if (cluster.isPrimary) {
  MongoHelper.getInstance().connect().then(async () => {
    const startTime: Date = new Date()
    logger.log('info', `Primary startup at ${startTime}`)

    // One-time, primary-only bootstrap. Migrations are idempotent (already
    // applied ones are skipped via the `migrations` collection); failures are
    // logged but never block serving — ensureIndexes stays the safety net.
    try {
      await runMigrations(MongoHelper.getDatabase())
    } catch (error: any) {
      logger.log('error', `Migrations failed at startup: ${error?.message ?? error}`, [error])
    }

    await ensureIndexes()

    // A fresh deployment has no sitemap until the 02:00 cron runs. Generate it
    // now (best-effort) so robots.txt never advertises a missing file.
    try {
      await runGenerateSitemap()
    } catch (error: any) {
      logger.log('error', `Startup sitemap generation failed: ${error?.message ?? error}`, [error])
    }

    // Cron jobs run once, in the primary, so N workers never run the same
    // import / README / sitemap / token-cleanup job concurrently.
    for (const name of Object.keys(cronJobs)) {
      const job = (cronJobs as any)[name]
      if (typeof job === 'object') {
        job.start()
      }
    }

    // The public-catalog predicate is `{ is_public: true }` (migration 0006 +
    // the importer keep it current). Verify the invariant before forking so a
    // failed migration can never silently empty every public query — this is a
    // loud warning, not a serving blocker (bootstrap stays best-effort).
    try {
      const assetsCollection = MongoHelper.getDatabase().collection('assets')
      const totalAssets = await assetsCollection.countDocuments({})
      if (totalAssets > 0) {
        const missingIsPublic = await assetsCollection.countDocuments({ is_public: { $exists: false } })
        if (missingIsPublic > 0) {
          logger.log('error', `CRITICAL: ${missingIsPublic}/${totalAssets} assets missing is_public (migration 0006 may have failed) — public discovery queries will return empty until fixed`)
        } else {
          logger.log('info', `is_public coverage verified for ${totalAssets} assets`)
        }
      }
    } catch (error: any) {
      logger.log('warn', `is_public coverage check failed: ${error?.message ?? error}`)
    }

    // Fork the HTTP workers after bootstrap so no worker ever serves before
    // migrations/indexes have been attempted.
    const workerCount = getWorkerCount()
    for (let i = 0; i < workerCount; i++) {
      cluster.fork()
    }
    logger.log('info', `Forked ${workerCount} worker(s)`)

    // Cluster-wide telemetry: workers ship their snapshots to the primary, which
    // sums them and broadcasts a cluster view so ANY worker's /metrics reports
    // the whole cluster. Entries are keyed by worker.id and removed on exit so
    // a crashed/reforked worker can never inflate the aggregate.
    const telemetrySnapshots = new Map<number, telemetry.TelemetrySnapshot>()

    // Auto-heal: replace a worker that crashed or was killed. A short delay
    // avoids a tight refork loop if something is wrong at boot, and reforking
    // is suppressed during an intentional shutdown so we never spin up workers
    // that were just SIGTERM'd. Also drop the dead worker's telemetry snapshot
    // and re-broadcast so cluster metrics never count exits/reforks twice.
    let shuttingDown = false
    cluster.on('exit', (worker, code, signal) => {
      telemetrySnapshots.delete(worker.id)
      const aggregate = telemetry.aggregateSnapshots([...telemetrySnapshots.values()])
      for (const id of Object.keys(cluster.workers ?? {})) {
        cluster.workers?.[id]?.send({ type: 'telemetry-cluster', aggregate })
      }
      if (shuttingDown) {
        return
      }
      logger.log('warn', `Worker ${worker.process.pid} exited (code=${code}, signal=${signal}); forking replacement`)
      setTimeout(() => {
        if (!shuttingDown) {
          cluster.fork()
        }
      }, 1000)
    })

    // Relay worker messages: admin site-file cache-invalidation (an admin save
    // on one worker is reflected everywhere) and telemetry snapshots (summed
    // above and broadcast back to every worker).
    cluster.on('message', (worker, message) => {
      const msg = message as {
        type?: string
        snapshot?: telemetry.TelemetrySnapshot
        aggregate?: telemetry.TelemetrySnapshot
      } | null
      if (msg?.type === 'invalidate-site-files') {
        for (const id of Object.keys(cluster.workers ?? {})) {
          cluster.workers?.[id]?.send({ type: 'invalidate-site-files' })
        }
      } else if (msg?.type === 'telemetry-snapshot' && msg.snapshot !== undefined) {
        telemetrySnapshots.set(worker.id, msg.snapshot)
        const aggregate = telemetry.aggregateSnapshots([...telemetrySnapshots.values()])
        for (const id of Object.keys(cluster.workers ?? {})) {
          cluster.workers?.[id]?.send({ type: 'telemetry-cluster', aggregate })
        }
      }
    })

    // Let Docker/systemd stop the cluster cleanly. Idempotent so a SIGTERM and
    // SIGINT arriving together only trigger one shutdown. Workers drain their
    // in-flight requests first; the primary waits for them with a bounded
    // deadline so deployments don't drop active requests.
    const shutdown = (): void => {
      if (shuttingDown) {
        return
      }
      shuttingDown = true
      logger.log('info', 'Primary shutting down; signaling workers to drain')

      const workers = Object.values(cluster.workers ?? {})
        .filter((worker): worker is NonNullable<typeof worker> => worker !== undefined)
      const drainTimeoutMs = parseDrainTimeout(process.env.PRIMARY_DRAIN_TIMEOUT_MS, 15_000)
      const timer = setTimeout(() => {
        logger.log('warn', 'Primary drain deadline exceeded; exiting')
        void disconnectDragonfly()
        MongoHelper.getInstance().disconnect()
        process.exit(0)
      }, drainTimeoutMs)
      timer.unref()

      const finish = (): void => {
        clearTimeout(timer)
        void disconnectDragonfly()
        MongoHelper.getInstance().disconnect()
        process.exit(0)
      }

      if (workers.length === 0) {
        finish()
        return
      }

      let remaining = workers.length
      for (const worker of workers) {
        worker.once('exit', () => {
          remaining -= 1
          if (remaining === 0) finish()
        })
        worker.kill('SIGTERM')
      }
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }).catch(error => {
    logger.log('error', 'Error during primary startup', error)
    process.exit(1)
  })
} else {
  // Worker: connect to MongoDB and serve HTTP only. No migrations, index
  // checks, sitemap generation or cron here — those run once in the primary.
  //
  // Listen for broadcasts from the primary: site-file cache invalidation (an
  // admin save happened on another worker) and the aggregated cluster
  // telemetry view used by /metrics.
  process.on('message', (message: unknown) => {
    const msg = message as {
      type?: string
      aggregate?: telemetry.TelemetrySnapshot
    } | null
    if (msg?.type === 'invalidate-site-files') {
      invalidateSiteFileCacheLocally()
    } else if (msg?.type === 'telemetry-cluster' && msg.aggregate !== undefined) {
      telemetry.setClusterSnapshot(msg.aggregate)
    }
  })

  // Periodically ship this worker's telemetry snapshot to the primary so it
  // can aggregate a cluster-wide view for /metrics on any worker.
  const parsedAggregateMs = Number.parseInt(process.env.TELEMETRY_AGGREGATE_INTERVAL_MS ?? '', 10)
  const aggregateIntervalMs = Number.isFinite(parsedAggregateMs) && parsedAggregateMs > 0 ? parsedAggregateMs : 10_000
  const aggregateTimer = setInterval(() => {
    if (process.send !== undefined) {
      process.send({ type: 'telemetry-snapshot', snapshot: telemetry.snapshot() })
    }
  }, aggregateIntervalMs)
  aggregateTimer.unref()

  let httpServer: http.Server | null = null
  let draining = false

  // Graceful drain: stop accepting new connections, let in-flight requests
  // finish, close idle keep-alive sockets, then exit after a bounded deadline.
  // This prevents deployments/restarts from dropping active requests.
  const shutdownWorker = (signal: string): void => {
    if (draining) return
    draining = true
    logger.log('info', `Worker ${process.pid} received ${signal}; draining`)
    const drainTimeoutMs = parseDrainTimeout(process.env.WORKER_DRAIN_TIMEOUT_MS, 10_000)
    const forceExit = setTimeout(() => {
      logger.log('warn', `Worker ${process.pid} drain deadline exceeded; forcing exit`)
      process.exit(0)
    }, drainTimeoutMs)
    forceExit.unref()

    const finish = (): void => {
      clearTimeout(forceExit)
      void disconnectDragonfly().finally(() => process.exit(0))
    }

    if (httpServer !== null) {
      // Close idle keep-alive connections so server.close() completes instead
      // of waiting for Cloudflare's long-lived sockets to age out.
      const closeIdle = (httpServer as any).closeIdleConnections
      if (typeof closeIdle === 'function') closeIdle.call(httpServer)
      httpServer.close((error) => {
        if (error !== undefined) {
          logger.log('error', `Worker ${process.pid} close error: ${error.message}`)
        }
        finish()
      })
    } else {
      finish()
    }
  }

  process.on('SIGTERM', () => shutdownWorker('SIGTERM'))
  process.on('SIGINT', () => shutdownWorker('SIGINT'))

  MongoHelper.getInstance().connect().then(() => {
    const startTime: Date = new Date()
    logger.log('info', `Worker ${process.pid} ready at ${startTime}`)
    const router: RouterServer = new RouterServer()
    httpServer = router.start(3000)
    // Warm the site-files cache now that Mongo is connected so the first
    // public request serves immediately instead of 404ing on an empty cache.
    primeSiteFilesCache()
  }).catch(error => {
    logger.log('error', `Error during worker ${process.pid} startup`, error)
    process.exit(1)
  })
}
