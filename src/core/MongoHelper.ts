import { MongoClient, Db } from 'mongodb'
import { logger } from 'core/utils/logger'

export class MongoHelper {
  private static instance: MongoHelper
  private static client: MongoClient
  private static db: Db
  private constructor () {}

  /**
   * Return our Mongo instance
   */
  public static getInstance (): MongoHelper {
    if (MongoHelper.instance == null) {
      MongoHelper.instance = new MongoHelper()
    }

    return MongoHelper.instance
  }

  /**
   * Fetch our MongoDB client connection
   *
   * @todo Add reconnect if no connection established
   */
  public static getClient (): MongoClient {
    if (MongoHelper.client == null) {
      throw new Error('No connection established')
    }

    return MongoHelper.client
  }

  /**
   * Fetch our default database
   *
   * @todo Add reconnect if no connection established
   */
  public static getDatabase (): Db {
    if (MongoHelper.db == null) {
      throw new Error('No connection established')
    }

    return MongoHelper.db
  }

  /**
   * Connect to MongoDB
   *
   * Connects and stores client and DB
   * into singleton static variables
   */
  public async connect (): Promise<any> {
    const url = `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?authSource=admin`

    try {
      // Traditional long-running web server (single instance). Connections are
      // created lazily on demand (minPoolSize 0) and pruned when idle, so the
      // pool "spins up as needed" rather than holding connections. Each search
      // request fans out ~6 concurrent queries (4 facet aggregations + results
      // + count) and the homepage ~4. RouterServer caps concurrent HTTP
      // requests at MAX_CONCURRENT_REQUESTS (default 100), so the worst-case
      // simultaneous connection demand is ~600; a 1000 ceiling leaves headroom
      // while still protecting the MongoDB server. Idle connections are reaped
      // after MONGO_MAX_IDLE_MS, so steady state stays low. Tune with
      // MONGO_MAX_POOL. The 5s wait-queue timeout stays as a fail-fast
      // backstop for genuine overload.
      const parsedMax = Number.parseInt(process.env.MONGO_MAX_POOL ?? '', 10)
      const maxPoolSize = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 1000

      // 0 = no pre-warmed connections; each one is established on first use.
      const parsedMin = Number.parseInt(process.env.MONGO_MIN_POOL ?? '', 10)
      const minPoolSize = Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : 0

      // Prune connections idle for 5+ minutes to avoid hoarding ~1MB per idle
      // connection on the MongoDB server.
      const parsedIdle = Number.parseInt(process.env.MONGO_MAX_IDLE_MS ?? '', 10)
      const maxIdleTimeMS = Number.isFinite(parsedIdle) && parsedIdle > 0 ? parsedIdle : 300_000

      const client = await MongoClient.connect(url, {
        maxPoolSize,
        minPoolSize,
        maxIdleTimeMS,
        waitQueueTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30_000,
        connectTimeoutMS: 10_000
      })
      MongoHelper.client = client
      MongoHelper.db = client.db(process.env.DB_NAME)

      return
    } catch (e: any) {
      const message = e.message ?? 'Failed to connect to Mongo'
      logger.log('warn', message, ...[e])
      throw new Error(e) // we want the app to crash if our DB is offline
    }
  }

  /**
   * Disconnect from MongoDB
   */
  public disconnect (): void {
    MongoHelper.client.close().catch(e => {
      logger.log('info', e.message)
    })
  }
}
