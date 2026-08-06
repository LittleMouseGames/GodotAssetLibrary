import { AnyBulkWriteOperation } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'

const BULK_SIZE = 100

/** Adjust asset vote totals in bounded batches, then remove all reviews for a user. */
export async function DeleteUserReviewsAndAdjustVotes (userId: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const reviews = mongo.collection('reviews')
  const assets = mongo.collection('assets')
  const cursor = reviews.aggregate<{ _id: { assetId: string, reviewType: string }, count: number }>([
    { $match: { user_id: userId } },
    {
      $group: {
        _id: { assetId: '$asset_id', reviewType: '$review_type' },
        count: { $sum: 1 }
      }
    }
  ], { maxTimeMS: 30_000 })

  let operations: AnyBulkWriteOperation[] = []
  try {
    for await (const group of cursor) {
      const field = group._id.reviewType === 'positive' ? 'upvotes' : 'downvotes'
      operations.push({
        updateOne: {
          filter: { asset_id: group._id.assetId },
          update: { $inc: { [field]: -group.count } }
        }
      })

      if (operations.length >= BULK_SIZE) {
        await assets.bulkWrite(operations, { ordered: false })
        operations = []
      }
    }

    if (operations.length > 0) {
      await assets.bulkWrite(operations, { ordered: false })
    }
  } finally {
    await cursor.close()
  }

  await reviews.deleteMany({ user_id: userId })
}
