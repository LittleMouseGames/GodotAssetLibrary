import { MongoHelper } from 'core/MongoHelper'
import { SiteFileEntry } from '../GET/GetSiteFiles'

/**
 * Replace the whole set of admin-managed site files with the given list:
 * upserts each submitted file (keyed by route) and deletes any existing file
 * whose route was not submitted. Handles renames naturally — an old route that
 * is no longer submitted is removed while the new route is created.
 */
export async function UpdateSiteFiles (files: SiteFileEntry[]): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const collection = mongo.collection('info')

  const existing = await collection.find({ type: 'site_file' }).project({ route: 1, _id: 0 }).toArray()
  const existingRoutes = new Set(
    existing.map(doc => doc.route).filter((route: unknown): route is string => typeof route === 'string' && route !== '')
  )
  const submittedRoutes = new Set(files.map(file => file.route))

  for (const file of files) {
    await collection.updateOne({
      type: 'site_file',
      route: file.route
    }, {
      $set: {
        content: file.content
      }
    }, {
      upsert: true
    })
  }

  for (const route of existingRoutes) {
    if (!submittedRoutes.has(route)) {
      await collection.deleteOne({ type: 'site_file', route: route })
    }
  }
}
