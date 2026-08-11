import { MongoHelper } from 'core/MongoHelper'

export async function GetAssetReviewCount (assetId: string): Promise<number> {
  const mongo = MongoHelper.getDatabase()
  return await mongo.collection('reviews').countDocuments({ asset_id: assetId })
}
