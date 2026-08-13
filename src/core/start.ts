import cluster from 'cluster'
import RouterServer from 'core/RouterServer'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import * as cronJobs from 'core/jobs.index'
import { ensureIndexes } from 'core/ensureIndexes'
import { runMigrations } from 'core/migrations'
import { runGenerateSitemap } from 'app/utilities/sitemapGenerator/jobs/generateSitemap'
import { getWorkerCount } from 'core/utils/clusterConfig'
import { invalidateSiteFileCacheLocally, primeSiteFilesCache } from 'core/utils/siteFiles'
import { invalidateCustomHeadElementsCacheLocally, primeCustomHeadElementsCache } from 'core/utils/customHeadElements'
import { disconnectDragonfly } from 'core/utils/dragonfly'

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
  process.exit(1)
})

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

    // Fork the HTTP workers after bootstrap so no worker ever serves before
    // migrations/indexes have been attempted.
    const workerCount = getWorkerCount()
    for (let i = 0; i < workerCount; i++) {
      cluster.fork()
    }
    logger.log('info', `Forked ${workerCount} worker(s)`)

    // Auto-heal: replace a worker that crashed or was killed. A short delay
    // avoids a tight refork loop if something is wrong at boot, and reforking
    // is suppressed during an intentional shutdown so we never spin up workers
    // that were just SIGTERM'd.
    let shuttingDown = false
    cluster.on('exit', (worker, code, signal) => {
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

    // Relay cache-invalidation broadcasts from any worker to all workers, so
    // an admin site-file save made on one worker is reflected everywhere
    // immediately (each worker keeps its own process-local site-files cache).
    cluster.on('message', (_worker, message) => {
      const msg = message as { type?: string } | null
      if (msg?.type === 'invalidate-site-files') {
        for (const id of Object.keys(cluster.workers ?? {})) {
          cluster.workers?.[id]?.send({ type: 'invalidate-site-files' })
        }
      }
      if (msg?.type === 'invalidate-custom-head-elements') {
        for (const id of Object.keys(cluster.workers ?? {})) {
          cluster.workers?.[id]?.send({ type: 'invalidate-custom-head-elements' })
        }
      }
    })

    // Let Docker/systemd stop the cluster cleanly. Idempotent so a SIGTERM and
    // SIGINT arriving together only trigger one shutdown.
    const shutdown = (): void => {
      if (shuttingDown) {
        return
      }
      shuttingDown = true
      logger.log('info', 'Primary shutting down; terminating workers')
      for (const id of Object.keys(cluster.workers ?? {})) {
        cluster.workers?.[id]?.kill('SIGTERM')
      }
      void disconnectDragonfly()
      MongoHelper.getInstance().disconnect()
      process.exit(0)
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
  // Listen for site-file cache-invalidation broadcasts from the primary (an
  // admin save happened on another worker) and invalidate this worker's cache.
  process.on('message', (message: unknown) => {
    const msg = message as { type?: string } | null
    if (msg?.type === 'invalidate-site-files') {
      invalidateSiteFileCacheLocally()
    }
    if (msg?.type === 'invalidate-custom-head-elements') {
      invalidateCustomHeadElementsCacheLocally()
    }
  })

  const shutdownWorker = (): void => {
    void disconnectDragonfly().finally(() => process.exit(0))
  }
  process.on('SIGTERM', shutdownWorker)
  process.on('SIGINT', shutdownWorker)

  MongoHelper.getInstance().connect().then(() => {
    const startTime: Date = new Date()
    logger.log('info', `Worker ${process.pid} ready at ${startTime}`)
    const server: RouterServer = new RouterServer()
    server.start(3000)
    // Warm the site-files cache now that Mongo is connected so the first
    // public request serves immediately instead of 404ing on an empty cache.
    primeSiteFilesCache()
    primeCustomHeadElementsCache()
  }).catch(error => {
    logger.log('error', `Error during worker ${process.pid} startup`, error)
    process.exit(1)
  })
}
