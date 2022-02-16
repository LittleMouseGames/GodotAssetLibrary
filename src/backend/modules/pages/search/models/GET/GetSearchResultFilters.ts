import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'

interface ReturnedAssets extends WithId<Document> {
  category: string
  godot_version: string
}

export async function GetSearchResultFilters (query: string): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()
  const filters: any = {}

  if (query !== '') {
    filters.$text = {
      $search: query,
      $caseSensitive: false
    }
  }

  const operationObject = await mongo.collection('assets').find(filters, {
    projection: {
      category: 1,
      godot_version: 1
    }
  }).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
