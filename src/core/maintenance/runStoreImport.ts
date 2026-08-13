import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { runImportFromStore } from 'app/utilities/fetchFromGodotStore/jobs/fetchFromGodotStore'

/**
 * One-off Godot Asset Store import runner.
 *
 * Useful for a manual ingest (e.g. a first sync or a forced refresh) without
 * waiting for the daily 01:30 cron. In development (RUN_MODE=devel) the
 * inventory is capped to a single page so you can smoke-test ingestion
 * against a small slice.
 *
 *   npm run import:store
 */
async function main (): Promise<void> {
  try {
    await MongoHelper.getInstance().connect()
    await runImportFromStore()
    MongoHelper.getInstance().disconnect()
    process.exit(0)
  } catch (e: any) {
    logger.log('error', e?.message ?? 'Godot Asset Store import failed')
    process.exit(1)
  }
}

void main()
