import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'
import { wilsonScore } from 'core/utils/ratingScore'

/**
 * Backfill the confidence-adjusted `rating_score` field from existing stored
 * upvotes/downvotes. This is intentionally non-destructive: it never changes
 * vote counters, only adds the derived score used by "Highest rated" sorting.
 * `npm run reconcile:ratings` later re-derives counters from canonical reviews.
 */
export async function backfillRatingScore (db: Db): Promise<void> {
  const assets = db.collection('assets')

  const cursor = assets.find(
    {
      $or: [{ upvotes: { $gt: 0 } }, { downvotes: { $gt: 0 } }]
    },
    {
      projection: { _id: 1, upvotes: 1, downvotes: 1 },
      batchSize: 500
    }
  )

  let updated = 0
  let processed = 0

  // Process sequentially in batches to keep memory and pool use bounded.
  for await (const asset of cursor) {
    processed++
    const upvotes = Number(asset.upvotes ?? 0)
    const downvotes = Number(asset.downvotes ?? 0)
    const result = await assets.updateOne(
      { _id: asset._id },
      { $set: { rating_score: wilsonScore(upvotes, downvotes) } }
    )
    if (result.modifiedCount > 0) updated++
  }

  // Assets with no votes should carry an explicit zero score as well.
  const zeroResult = await assets.updateMany(
    { rating_score: { $exists: false }, upvotes: 0, downvotes: 0 },
    { $set: { rating_score: 0 } }
  )

  logger.log(
    'info',
    `Backfilled rating_score for ${updated} rated assets (${processed} checked, ` +
    `${zeroResult.modifiedCount ?? 0} set to zero)`
  )
}
