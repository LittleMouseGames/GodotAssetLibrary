import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'
import { createWeightedTextIndex } from './0001-create-text-index'
import { backfillRatingScore } from './0002-backfill-rating-score'
import { backfillModifyDate } from './0003-backfill-modify-date'
import { dedupeReviewsAndIndex } from './0004-dedupe-reviews'
import { backfillGodotMajor } from './0005-backfill-godot-major'

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
  }
]

/**
 * Apply each unapplied migration in order, recording completion in the
 * `migrations` collection so the process is idempotent.
 */
export async function runMigrations (db: Db): Promise<void> {
  const migrationCollection = db.collection('migrations')

  for (const migration of MIGRATIONS) {
    const applied = await migrationCollection.findOne({ id: migration.id })
    if (applied !== null) {
      logger.log('info', `Migration ${migration.id} already applied`)
      continue
    }

    logger.log('info', `Applying migration ${migration.id}: ${migration.description}`)
    await migration.run(db)
    await migrationCollection.insertOne({ id: migration.id, applied_at: new Date() })
    logger.log('info', `Applied migration ${migration.id}`)
  }
}
