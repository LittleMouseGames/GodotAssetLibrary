import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { wilsonScore } from 'core/utils/ratingScore'

/**
 * Recompute every asset's upvotes/downvotes/rating_score from the canonical
 * reviews collection. Idempotent and safe to run repeatedly; run it via
 * `npm run reconcile:ratings` after auditing duplicates.
 *
 * Assets with stored counters but no remaining review documents are reset to
 * zero so stale counters cannot survive the deletion of the last review.
 */
export async function reconcileRatings (): Promise<void> {
  const db = MongoHelper.getDatabase()
  const reviews = db.collection('reviews')
  const assets = db.collection('assets')

  const counts = await reviews.aggregate([
    {
      $group: {
        _id: '$asset_id',
        upvotes: { $sum: { $cond: [{ $eq: ['$review_type', 'positive'] }, 1, 0] } },
        downvotes: { $sum: { $cond: [{ $eq: ['$review_type', 'negative'] }, 1, 0] } }
      }
    }
  ]).toArray()

  let updated = 0
  const reviewedAssetIds: string[] = []

  for (const row of counts) {
    if (row._id == null) continue
    const upvotes = row.upvotes as number
    const downvotes = row.downvotes as number
    reviewedAssetIds.push(row._id as string)

    const result = await assets.updateOne(
      { asset_id: row._id },
      {
        $set: {
          upvotes,
          downvotes,
          rating_score: wilsonScore(upvotes, downvotes)
        }
      }
    )
    if (result.modifiedCount > 0) updated++
  }

  // Reset assets that still carry counters but have no remaining reviews.
  const resetResult = await assets.updateMany(
    {
      asset_id: { $nin: reviewedAssetIds },
      $or: [{ upvotes: { $gt: 0 } }, { downvotes: { $gt: 0 } }, { rating_score: { $gt: 0 } }]
    },
    { $set: { upvotes: 0, downvotes: 0, rating_score: 0 } }
  )

  logger.log(
    'info',
    `Reconciled ${updated} assets (${counts.length} reviewed assets checked, ` +
    `${resetResult.modifiedCount ?? 0} stale counters reset)`
  )
}
