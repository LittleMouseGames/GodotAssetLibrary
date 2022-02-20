import { MongoHelper } from 'MongoHelper'

/**
 * Get username given a user human_id
 *
 * @param {string} id human_id
 * @returns {Promise<string>}
 */
export async function GetUsernameById (id: string): Promise<string> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    human_id: id
  }, {
    projection: {
      username: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.username
}
