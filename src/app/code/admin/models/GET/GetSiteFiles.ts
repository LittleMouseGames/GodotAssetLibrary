import { MongoHelper } from 'core/MongoHelper'

export interface SiteFileEntry {
  route: string
  content: string
}

export async function GetSiteFiles (): Promise<SiteFileEntry[]> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').find({
    type: 'site_file'
  }).toArray()

  if (operationObject === null || operationObject === undefined) {
    return []
  }

  return operationObject
    .filter(doc => typeof doc.route === 'string' && doc.route !== '')
    .map(doc => ({
      route: doc.route,
      content: typeof doc.content === 'string' ? doc.content : ''
    }))
}
