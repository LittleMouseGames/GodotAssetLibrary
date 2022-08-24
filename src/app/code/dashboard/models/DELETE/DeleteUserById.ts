import { MongoHelper } from 'core/MongoHelper'

export async function DeleteUserByUserId (userId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').deleteOne({
    user_id: userId
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to delete user')
  }
}
