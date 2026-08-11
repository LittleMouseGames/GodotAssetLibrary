import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { runMigrations } from './index'

async function main (): Promise<void> {
  try {
    await MongoHelper.getInstance().connect()
    await runMigrations(MongoHelper.getDatabase())
    MongoHelper.getInstance().disconnect()
    process.exit(0)
  } catch (e: any) {
    logger.log('error', e?.message ?? 'Migrations failed')
    process.exit(1)
  }
}

void main()
