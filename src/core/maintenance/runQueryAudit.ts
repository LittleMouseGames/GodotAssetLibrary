import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { runQueryAudit } from './queryAudit'

async function main (): Promise<void> {
  try {
    await MongoHelper.getInstance().connect()
    await runQueryAudit()
    MongoHelper.getInstance().disconnect()
    process.exit(0)
  } catch (e: any) {
    logger.log('error', e?.message ?? 'Query audit failed')
    process.exit(1)
  }
}

void main()
