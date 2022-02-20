import { MongoHelper } from 'MongoHelper'

/**
 * Increase negative vote count for asset
 *
 * @param {string} assetId
 */
export async function UpdateNegativeVotesAddOne (assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').updateOne({
    asset_id: assetId
  }, {
    $inc: {
      downvotes: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update post')
  }
}
