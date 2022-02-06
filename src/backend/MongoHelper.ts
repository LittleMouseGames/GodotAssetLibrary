import { MongoClient, Db } from 'mongodb'
import { logger } from 'utility/logger'

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
      const client = await MongoClient.connect(url)
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
