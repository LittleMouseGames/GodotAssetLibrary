import { MongoHelper } from 'MongoHelper'

/**
 * Update username on asset by user ID
 *
 * @param {string} userId
 * @param {string} username
 * @returns
 */
export async function UpdateAssetsInformationByUserId (userId: string, username: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').updateMany({
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
