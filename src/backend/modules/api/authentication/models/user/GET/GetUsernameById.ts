import { MongoHelper } from 'MongoHelper'

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
