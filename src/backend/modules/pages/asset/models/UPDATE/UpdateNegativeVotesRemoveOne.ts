import { MongoHelper } from 'MongoHelper'

/**
 * Remove negative vote on asset
 *
 * @param {string} assetId
 */
export async function UpdateNegativeVotesRemoveOne (assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').updateOne({
    asset_id: assetId
  }, {
    $inc: {
      downvotes: -1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update post')
  }
}
