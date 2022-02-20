import { MongoHelper } from 'MongoHelper'

/**
 * Add asset ID to users saved_assets list
 *
 * @param {string} hashedToken
 * @param {string} assetId
 */
export async function UpdateUserSavedAssetsAdd (hashedToken: string, assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': hashedToken
  }, {
    $push: {
      saved_assets: assetId
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update user')
  }
}
