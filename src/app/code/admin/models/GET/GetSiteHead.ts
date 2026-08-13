import { MongoHelper } from 'core/MongoHelper'

/**
 * Fetch the admin-configured HTML fragment that is injected into the <head>
 * of every public page (e.g. extra <meta> tags, analytics scripts, schema.org
 * JSON-LD). Returns an empty string when nothing is configured.
 */
export async function GetSiteHead (): Promise<string> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').findOne({
    type: 'site_head'
  }, {
    projection: {
      content: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return ''
  }

  return typeof operationObject.content === 'string' ? operationObject.content : ''
}
