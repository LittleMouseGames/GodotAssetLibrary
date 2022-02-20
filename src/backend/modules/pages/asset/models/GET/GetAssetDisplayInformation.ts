import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { assetSchema } from 'utility/schema/assets'

interface ReturnedAsset extends WithId<Document>, assetSchema {}

/**
 * Get asset information for display page
 *
 * @param {string} assetId
 * @returns {ReturnedAsset}
 */
export async function GetAssetDisplayInformation (assetId: String): Promise<ReturnedAsset> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({ asset_id: assetId }) as ReturnedAsset

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
