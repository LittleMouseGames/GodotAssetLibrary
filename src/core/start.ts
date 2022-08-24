import RouterServer from 'core/RouterServer'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import * as cronJobs from 'core/jobs.index'

// Connect to MongoDB Database
MongoHelper.getInstance().connect().then(() => {
  const startTime: Date = new Date()
  logger.log('info', `Successfull startup at ${startTime}`)

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
