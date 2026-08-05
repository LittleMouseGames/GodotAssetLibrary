import { MongoHelper } from 'core/MongoHelper'
import { buildSearchFilter } from './buildSearchFilter'

export async function GetAssetsCountFromQuery (query: string, categoryFilters: any[], engineFilters: any[]): Promise<number> {
  const mongo = MongoHelper.getDatabase()
  const filter = buildSearchFilter(query, categoryFilters, engineFilters)
  return mongo.collection('assets').countDocuments(filter)
}
