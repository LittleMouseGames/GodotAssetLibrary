import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { runCatalogAudit } from './catalogAudit'

async function main (): Promise<void> {
  try {
    await MongoHelper.getInstance().connect()
    await runCatalogAudit()
    MongoHelper.getInstance().disconnect()
    process.exit(0)
  } catch (e: any) {
    logger.log('error', e?.message ?? 'Catalog audit failed')
    process.exit(1)
  }
}

void main()
