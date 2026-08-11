import { MongoHelper } from 'core/MongoHelper'
import { wilsonScore } from 'core/utils/ratingScore'

/**
 * Recompute an asset's upvotes/downvotes/rating_score from its canonical
 * review documents. This is the single source of truth for the counters and
 * keeps them consistent with what cards display, even if an earlier write
 * failed partway through.
 */
export async function RefreshAssetRating (assetId: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const reviews = mongo.collection('reviews')

  const [row] = await reviews.aggregate([
    { $match: { asset_id: assetId } },
    {
      $group: {
        _id: '$asset_id',
        upvotes: { $sum: { $cond: [{ $eq: ['$review_type', 'positive'] }, 1, 0] } },
        downvotes: { $sum: { $cond: [{ $eq: ['$review_type', 'negative'] }, 1, 0] } }
      }
    }
  ]).maxTimeMS(5000).toArray()

  const upvotes = row?.upvotes ?? 0
  const downvotes = row?.downvotes ?? 0

  await mongo.collection('assets').updateOne(
    { asset_id: assetId },
    {
      $set: {
        upvotes,
        downvotes,
        rating_score: wilsonScore(upvotes, downvotes)
      }
    }
  )
}
