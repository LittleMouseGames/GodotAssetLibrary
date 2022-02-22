import { MongoHelper } from 'MongoHelper'

export async function GetAllUserComments (userId: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('comments').find({
    user_id: userId
  }).toArray()

  return operationObject
}