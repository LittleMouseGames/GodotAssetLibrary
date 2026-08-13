import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetSchema } from 'app/utilities/fetchFromGodot/schema/assets'

interface ReturnedAsset extends WithId<Document>, assetSchema {}

/**
 * Load every variant document in a project group (the root plus any linked
 * Store/legacy siblings). Used by the asset page to resolve the preferred
 * variant (store-first default) and to render the source switcher.
 */
export async function GetGroupVariants (groupId: string): Promise<ReturnedAsset[]> {
  const mongo = MongoHelper.getDatabase()
  const docs = await mongo.collection('assets').find({ group_id: groupId }, {
    projection: {
      _id: 0,
      author_id: 0,
      category_id: 0,
      download_provider: 0,
      legacy_asset_id: 0,
      version: 0
    }
  }).toArray() as ReturnedAsset[]

  return docs
}
