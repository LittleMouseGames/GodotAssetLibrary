import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { assetGridSchema } from 'utility/schema/assets-grid'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

/**
 * Fetch assets that match query
 *
 * @param {string} limit
 * @param {string} skip
 * @param {[string]} assetIds
 * @returns {ReturnedAssets[]}
 */
export async function GetUserAssetsFromQuery (limit: number = 12, skip: number, assetIds: [string], sort: any): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()

  const operationObject = await mongo.collection('assets').find({
    asset_id: {
      $in: assetIds
    }
  }, {
    limit: limit,
    sort: sort,
    projection: {
      category: 1,
      godot_version: 1,
      author: 1,
      title: 1,
      quick_description: 1,
      icon_url: 1,
      upvotes: 1,
      downvotes: 1,
      featured: 1,
      asset_id: 1,
      previews: 1,
      card_banner: 1
    }
  }).skip(skip).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
