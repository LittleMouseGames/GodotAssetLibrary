import RouterServer from 'core/RouterServer'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import * as cronJobs from 'core/jobs.index'
import { ensureIndexes } from 'core/ensureIndexes'
import { runMigrations } from 'core/migrations'

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
