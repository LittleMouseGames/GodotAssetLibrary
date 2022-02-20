import { MongoHelper } from 'MongoHelper'

/**
 * Get users reviewed asset list
 *
 * @param {string} token
 * @returns
 */
export async function GetUserReviewedAssets (token: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      _id: 0,
      reviewed_assets: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.reviewed_assets
}
