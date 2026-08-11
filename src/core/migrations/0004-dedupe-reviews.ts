import { Db, ObjectId } from 'mongodb'
import { logger } from 'core/utils/logger'

/**
 * Deduplicate review documents by (user_id, asset_id), keeping the most
 * recent record per pair, then create the unique compound index that makes
 * duplicate reviews structurally impossible.
 *
 * Run `npm run reconcile:ratings` afterwards so vote counters and rating_score
 * reflect the deduplicated review set.
 */
export async function dedupeReviewsAndIndex (db: Db): Promise<void> {
  const reviews = db.collection('reviews')

  const duplicates = await reviews.aggregate([
    {
      $group: {
        _id: { user_id: '$user_id', asset_id: '$asset_id' },
        count: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).maxTimeMS(60000).toArray()

  let removed = 0

  for (const group of duplicates) {
    // Keep the most recently written record (date, then _id as a tie-breaker).
    const keep = await reviews.findOne(
      { _id: { $in: group.ids } },
      { sort: { date: -1, _id: -1 } }
    )
    if (keep == null) continue

    const removeIds = (group.ids as ObjectId[]).filter(id => !id.equals(keep._id))
    if (removeIds.length === 0) continue

    const result = await reviews.deleteMany({ _id: { $in: removeIds } })
    removed += result.deletedCount ?? 0
  }

  logger.log('info', `Removed ${removed} duplicate review documents across ${duplicates.length} groups`)

  // Unique index: safe now that duplicates are gone. If it already exists,
  // MongoDB treats this as a no-op and returns success.
  await reviews.createIndex(
    { user_id: 1, asset_id: 1 },
    { unique: true, name: 'user_asset_unique' }
  )
  logger.log('info', 'Unique (user_id, asset_id) review index verified')
}
