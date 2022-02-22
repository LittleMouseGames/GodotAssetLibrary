import { MongoHelper } from 'MongoHelper'

export async function DeleteAllUserComments (userId: String): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('reviews').deleteMany({
    user_id: userId
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Unable to delete user comments')
  }
}
