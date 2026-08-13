import { MongoHelper } from 'core/MongoHelper'

/**
 * Upsert the admin-configured HTML fragment that is injected into the <head>
 * of every public page. Stored as a single `info` document with
 * `{ type: 'site_head', content }`. Pass an empty string to clear it.
 */
export async function UpdateSiteHead (content: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').updateOne({
    type: 'site_head'
  }, {
    $set: {
      content: content
    }
  }, {
    upsert: true
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update (or upsert) site head settings')
  }
}
