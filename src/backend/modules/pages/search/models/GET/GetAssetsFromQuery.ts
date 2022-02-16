import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { assetGridSchema } from 'utility/schema/assets-grid'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetAssetsFromQuery (query: string, limit: number = 12, categoryFilters: any[], engineFilters: any[]): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const filters: any = {}

  console.log(engineFilters.length)

  if (Array.isArray(categoryFilters) && categoryFilters.length > 0) {
    filters.category_lowercase = {
      $in: categoryFilters
    }
  }

  if (Array.isArray(engineFilters) && engineFilters.length > 0) {
    filters.godot_version = {
      $in: engineFilters
    }
  }

  const operationObject = await mongo.collection('assets').find({
    $and: [
      filters,
      {
        $text: {
          $search: query,
          $caseSensitive: false
        }
      }
    ]
  }, {
    limit: limit,
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
      previews: 1
    }
  }).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
