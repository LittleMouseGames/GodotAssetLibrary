import RouterServer from 'core/RouterServer'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import * as cronJobs from 'core/jobs.index'
import { ensureIndexes } from 'core/ensureIndexes'
import { runMigrations } from 'core/migrations'
import { runGenerateSitemap } from 'app/utilities/sitemapGenerator/jobs/generateSitemap'

// Connect to MongoDB Database
MongoHelper.getInstance().connect().then(async () => {
  const startTime: Date = new Date()
  logger.log('info', `Successfull startup at ${startTime}`)

  // Apply any pending migrations before verifying indexes. This is idempotent:
  // already-applied migrations are skipped via the `migrations` collection, so
  // it is a no-op on every normal boot. Failures are logged but do not block
  // serving — ensureIndexes still runs as the safety net.
  try {
    await runMigrations(MongoHelper.getDatabase())
  } catch (error: any) {
    logger.log('error', `Migrations failed at startup: ${error?.message ?? error}`, [error])
  }

  await ensureIndexes()

  // A fresh deployment has no sitemap until the 02:00 cron runs. Generate it
  // now (best-effort, non-blocking) so robots.txt never advertises a missing
  // file. The daily cron still refreshes it.
  try {
    await runGenerateSitemap()
  } catch (error: any) {
    logger.log('error', `Startup sitemap generation failed: ${error?.message ?? error}`, [error])
  }

  // Start our server
  const server: RouterServer = new RouterServer()
  server.start(3000)

  // init all our cron jobs
  for (const name of Object.keys(cronJobs)) {
    const job = (cronJobs as any)[name]
    if (typeof job === 'object') {
      job.start()
    }
  }
}).catch(error => {
  logger.log('error', 'Error durring startup', error)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
  process.exit(1)
})
