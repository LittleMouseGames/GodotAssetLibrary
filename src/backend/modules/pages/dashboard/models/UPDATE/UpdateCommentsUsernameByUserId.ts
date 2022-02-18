import { MongoHelper } from 'MongoHelper'

export async function UpdateCommentsInformationByUserId (userId: string, username: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('comments').updateMany({
    user_id: userId
  }, {
    $set: {
      username: username
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update asset information')
  }

  return operationObject
}
