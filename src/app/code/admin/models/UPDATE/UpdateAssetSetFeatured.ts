import { MongoHelper } from 'core/MongoHelper'

/**
 * Sync the legacy `featured` flag across EVERY variant of a project group so
 * `?featured=true` search and admin badges stay consistent with the homepage
 * hero. Matches both the group id and the raw asset id so standalone (unlinked)
 * records are covered too.
 */
export async function UpdateAssetSetFeatured (groupId: string, featured: boolean): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').updateMany({
    $or: [
      { group_id: groupId },
      { asset_id: groupId }
    ]
  }, {
    $set: {
      featured: featured
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update asset information')
  }

  return operationObject
}
