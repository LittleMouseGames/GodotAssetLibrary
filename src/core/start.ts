import cluster from 'cluster'
import RouterServer from 'core/RouterServer'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import * as cronJobs from 'core/jobs.index'
import { ensureIndexes } from 'core/ensureIndexes'
import { runMigrations } from 'core/migrations'
import { runGenerateSitemap } from 'app/utilities/sitemapGenerator/jobs/generateSitemap'
import { getWorkerCount } from 'core/utils/clusterConfig'

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
    // avoids a tight refork loop if something is wrong at boot.
    cluster.on('exit', (worker, code, signal) => {
      logger.log('warn', `Worker ${worker.process.pid} exited (code=${code}, signal=${signal}); forking replacement`)
      setTimeout(() => {
        cluster.fork()
      }, 1000)
    })

    // Let Docker/systemd stop the cluster cleanly.
    const shutdown = (): void => {
      logger.log('info', 'Primary shutting down; terminating workers')
      for (const id of Object.keys(cluster.workers ?? {})) {
        cluster.workers?.[id]?.kill('SIGTERM')
      }
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
  MongoHelper.getInstance().connect().then(() => {
    const startTime: Date = new Date()
    logger.log('info', `Worker ${process.pid} ready at ${startTime}`)
    const server: RouterServer = new RouterServer()
    server.start(3000)
  }).catch(error => {
    logger.log('error', `Error during worker ${process.pid} startup`, error)
    process.exit(1)
  })
}
