import RouterServer from 'RouterServer'
import { MongoHelper } from 'MongoHelper'
import { logger } from 'utility/logger'
import * as cronJobs from 'jobs.index'
import { generateProxyUrl } from 'utility/generateProxyUrl'

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
  logger.log('error', error)
})

console.log(generateProxyUrl('https://teacherdanmax.files.wordpress.com/2013/09/school-test.png'))
