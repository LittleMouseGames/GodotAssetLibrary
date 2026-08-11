import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { assetGridSchema } from 'app/components/partials/catalog-grid/asset-grd-schema'
import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetLastModifiedAssets (): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').find({ ...PUBLIC_ASSET_FILTER }, {
    limit: 8,
    projection: {
      category: 1,
      godot_version: 1,
      author: 1,
      title: 1,
      quick_description: 1,
      icon_url: 1,
      upvotes: 1,
      downvotes: 1,
      rating_score: 1,
      featured: 1,
      asset_id: 1,
      previews: 1,
      card_banner: 1,
      modify_date: 1,
      added_date: 1,
      version_string: 1,
      type: 1,
      support_level: 1
    }
  }).sort({ modify_date_at: -1, asset_id: 1 }).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
