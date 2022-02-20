import { MongoHelper } from 'MongoHelper'

/**
 * Remove asset ID from users saved_assets list
 *
 * @param {string} hashedToken
 * @param {string} assetId
 */
export async function UpdateUserSavedAssetsRemove (hashedToken: string, assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': hashedToken
  }, {
    $pull: {
      saved_assets: assetId
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update user')
  }
}
