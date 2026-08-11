import { MongoHelper } from 'core/MongoHelper'

/**
 * Delete a user document by its public human_id.
 *
 * Note: user documents store `human_id` (not `user_id`). Deleting by the wrong
 * key silently matches nothing, so this verifies that exactly one document was
 * actually removed and throws otherwise.
 */
export async function DeleteUserByUserId (humanId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').deleteOne({
    human_id: humanId
  })

  if (operationObject?.deletedCount !== 1) {
    throw new Error('Unable to delete user')
  }
}
