import { MongoHelper } from 'core/MongoHelper'

export interface UserReviewRow {
  asset_id: string
  review_type: string
  text: string
  headline: string
  date: Date
  modified_date?: Date
}

/**
 * Canonical review documents for a user, newest first with deterministic
 * ordering and bounded pagination. The `reviews` collection (not the
 * denormalized `users.reviewed_assets` array) is the source of truth.
 */
export async function GetUserReviewsByToken (
  userId: string,
  limit: number,
  skip: number
): Promise<{ rows: UserReviewRow[], total: number }> {
  const mongo = MongoHelper.getDatabase()
  const reviews = mongo.collection('reviews')

  const filter = { user_id: userId }

  const [rows, total] = await Promise.all([
    reviews.find(filter, {
      projection: {
        asset_id: 1,
        review_type: 1,
        text: 1,
        headline: 1,
        date: 1,
        modified_date: 1
      },
      limit,
      sort: { date: -1, _id: -1 }
    }).skip(skip).toArray() as unknown as Promise<UserReviewRow[]>,
    reviews.countDocuments(filter)
  ])

  return { rows, total }
}
