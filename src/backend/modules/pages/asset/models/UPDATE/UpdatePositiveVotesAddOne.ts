import { MongoHelper } from 'MongoHelper'

/**
 * Update positive vote for assest
 *
 * @param {string} assetId
 */
export async function UpdatePositiveVotesAddOne (assetId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').updateOne({
    asset_id: assetId
  }, {
    $inc: {
      upvotes: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to update post')
  }
}
