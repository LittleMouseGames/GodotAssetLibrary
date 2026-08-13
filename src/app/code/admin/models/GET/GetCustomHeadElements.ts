import { MongoHelper } from 'core/MongoHelper'

export async function GetCustomHeadElements (): Promise<string[]> {
  const mongo = MongoHelper.getDatabase()
  const doc = await mongo.collection('info').findOne({ type: 'custom_head_elements' })

  if (doc === null || doc === undefined || !Array.isArray(doc.elements)) {
    return []
  }

  return doc.elements.filter((el: unknown): el is string => typeof el === 'string')
}
