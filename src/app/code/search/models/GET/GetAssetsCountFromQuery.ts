import { MongoHelper } from 'core/MongoHelper'
import { buildSearchFilter, SearchFilterOptions } from './buildSearchFilter'

export async function GetAssetsCountFromQuery (query: string, options: SearchFilterOptions = {}): Promise<number> {
  const mongo = MongoHelper.getDatabase()
  const filter = buildSearchFilter(query, options)
  return await mongo.collection('assets').countDocuments(filter, { maxTimeMS: 5000 })
}
