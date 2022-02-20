import { MongoHelper } from 'MongoHelper'

export async function GetAssetsCountFromQuery (query: string, categoryFilters: any[], engineFilters: any[]): Promise<number> {
  const mongo = MongoHelper.getDatabase()
  const filters: any = {}

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

  if (query !== '') {
    filters.$text = {
      $search: query,
      $caseSensitive: false
    }
  }

  const operationObject = await mongo.collection('assets').find({
    $and: [
      filters
    ]
  }).count()

  if (operationObject === null || operationObject === undefined) {
    return 0
  }

  return operationObject
}
