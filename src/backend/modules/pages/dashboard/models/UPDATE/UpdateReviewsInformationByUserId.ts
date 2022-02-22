import { MongoHelper } from 'MongoHelper'

/**
 * Update comment username by userId
 *
 * @param {string} userId
 * @param {string} username
 * @returns
 */
export async function UpdateReviewsInformationByUserId (userId: string, username: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reviews').updateMany({
    user_id: userId
  }, {
    $set: {
      username: username
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update asset information')
  }

  return operationObject
}
