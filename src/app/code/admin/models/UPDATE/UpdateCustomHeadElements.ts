import { MongoHelper } from 'core/MongoHelper'

export async function UpdateCustomHeadElements (elements: string[]): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  await mongo.collection('info').updateOne(
    { type: 'custom_head_elements' },
    { $set: { elements } },
    { upsert: true }
  )
}
