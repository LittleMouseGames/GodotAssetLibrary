import { MongoHelper } from 'MongoHelper'

export async function DeleteReviewById (reviewId: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()

  const operationObject = await mongo.collection('reviews').deleteOne({
    human_id: reviewId
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }
}
