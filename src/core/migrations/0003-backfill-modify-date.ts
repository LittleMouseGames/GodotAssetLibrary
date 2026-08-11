import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'

/**
 * Backfill the normalized `modify_date_at` Date field from the legacy
 * `modify_date` field (stored as a string or Date depending on the record).
 *
 * "Recently updated" sorting uses `modify_date_at`, and documents without it
 * sort last. This migration populates the normalized date so legacy assets
 * join the correct ordering. Records whose `modify_date` cannot be parsed are
 * left untouched.
 */
export async function backfillModifyDate (db: Db): Promise<void> {
  const assets = db.collection('assets')

  const cursor = assets.find(
    { modify_date_at: { $exists: false } },
    { projection: { _id: 1, modify_date: 1 }, batchSize: 500 }
  )

  let updated = 0
  let skipped = 0

  for await (const asset of cursor) {
    const raw = asset.modify_date
    if (raw == null) {
      skipped++
      continue
    }

    const date = raw instanceof Date ? raw : new Date(String(raw))
    if (isNaN(date.getTime())) {
      skipped++
      continue
    }

    const result = await assets.updateOne(
      { _id: asset._id },
      { $set: { modify_date_at: date } }
    )
    if (result.modifiedCount > 0) updated++
  }

  logger.log('info', `Backfilled modify_date_at for ${updated} assets (${skipped} skipped)`)
}
