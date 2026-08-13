import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'
import { createWeightedTextIndex } from './0001-create-text-index'
import { backfillRatingScore } from './0002-backfill-rating-score'
import { backfillModifyDate } from './0003-backfill-modify-date'
import { dedupeReviewsAndIndex } from './0004-dedupe-reviews'
import { backfillGodotMajor } from './0005-backfill-godot-major'
import { backfillIsPublic } from './0006-backfill-is-public'
import { backfillProviderIdentity } from './0007-provider-identity'

export interface Migration {
  id: string
  description: string
  run: (db: Db) => Promise<void>
}

const MIGRATIONS: Migration[] = [
  {
    id: '0001-create-weighted-text-index',
    description: 'Create the weighted text index used for asset search',
    run: createWeightedTextIndex
  },
  {
    id: '0002-backfill-rating-score',
    description: 'Backfill the confidence-adjusted rating_score used by "Highest rated" sorting',
    run: backfillRatingScore
  },
  {
    id: '0003-backfill-modify-date',
    description: 'Backfill the normalized modify_date_at used by "Recently updated" sorting',
    run: backfillModifyDate
  },
  {
    id: '0004-dedupe-reviews',
    description: 'Deduplicate reviews by (user_id, asset_id) and create the unique index',
    run: dedupeReviewsAndIndex
  },
  {
    id: '0005-backfill-godot-major',
    description: 'Backfill the numeric godot_major used by major-line browsing filters',
    run: backfillGodotMajor
  },
  {
    id: '0006-backfill-is-public',
    description: 'Backfill the denormalized is_public flag used by the public-catalog filter',
    run: backfillIsPublic
  },
  {
    id: '0007-provider-identity',
    description: 'Backfill provider-qualified identity (provider, source_asset_id, group fields, godot_majors) and create the unique source index',
    run: backfillProviderIdentity
  }
]

/**
 * Apply each unapplied migration in order, recording completion in the
 * `migrations` collection so the process is idempotent.
 *
 * Each migration runs independently: a failure in one is logged but never
 * aborts the remaining migrations, so a single bad script cannot knock out
 * the rest. A failed migration is NOT recorded as applied, so it is retried
 * on the next run. If any migration failed, an Error naming the failures is
 * thrown after the loop — standalone `npm run migrate` then exits non-zero,
 * while startup (which wraps this call) logs it and still proceeds to
 * `ensureIndexes()` as the safety net.
 *
 * `migrations` is injectable for tests and defaults to the real registry.
 */
export async function runMigrations (db: Db, migrations: Migration[] = MIGRATIONS): Promise<void> {
  const migrationCollection = db.collection('migrations')
  const failures: string[] = []

  for (const migration of migrations) {
    try {
      const applied = await migrationCollection.findOne({ id: migration.id })
      if (applied !== null) {
        logger.log('info', `Migration ${migration.id} already applied`)
        continue
      }

      logger.log('info', `Applying migration ${migration.id}: ${migration.description}`)
      await migration.run(db)
      await migrationCollection.insertOne({ id: migration.id, applied_at: new Date() })
      logger.log('info', `Applied migration ${migration.id}`)
    } catch (error: any) {
      failures.push(migration.id)
      logger.log('error', `Migration ${migration.id} failed (continuing with remaining migrations): ${error?.message ?? error}`, [error])
    }
  }

  if (failures.length > 0) {
    throw new Error(`Migration(s) failed: ${failures.join(', ')}`)
  }
}
