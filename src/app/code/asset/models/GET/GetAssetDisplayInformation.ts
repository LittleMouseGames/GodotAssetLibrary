import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetSchema } from 'app/utilities/fetchFromGodot/schema/assets'

interface ReturnedAsset extends WithId<Document>, assetSchema {}

/**
 * Get asset information for display page
 *
 * @param {string} assetId
 * @returns {Promise<ReturnedAsset | null>} the asset, or null when it does not exist
 */
export async function GetAssetDisplayInformation (assetId: String): Promise<ReturnedAsset | null> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({ asset_id: assetId }, {
    projection: {
      _id: 0,
      author_id: 0,
      category_id: 0,
      download_provider: 0,
      legacy_asset_id: 0,
      version: 0
    }
  }) as ReturnedAsset | null

  return operationObject
}
