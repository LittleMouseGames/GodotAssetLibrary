import { MongoHelper } from 'MongoHelper'

/**
 *  Check if post exists given an ID
 *
 * @param {string} assetId
 * @returns {Promise<boolean>}
 */
export async function GetDoesPostExistById (assetId: String): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({
    asset_id: assetId
  }, {
    projection: {
      asset_id: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}
