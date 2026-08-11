import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { reconcileRatings } from './reconcileRatings'

async function main (): Promise<void> {
  try {
    await MongoHelper.getInstance().connect()
    await reconcileRatings()
    MongoHelper.getInstance().disconnect()
    process.exit(0)
  } catch (e: any) {
    logger.log('error', e?.message ?? 'Rating reconciliation failed')
    process.exit(1)
  }
}

void main()
