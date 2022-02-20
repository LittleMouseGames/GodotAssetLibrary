import { MongoHelper } from 'MongoHelper'

/**
 * Remove positive vote on asset
 *
 * @param {string} assetId
 */
export async function UpdatePositiveVotesRemoveOne (assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').updateOne({
    asset_id: assetId
  }, {
    $inc: {
      upvotes: -1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update post')
  }
}
