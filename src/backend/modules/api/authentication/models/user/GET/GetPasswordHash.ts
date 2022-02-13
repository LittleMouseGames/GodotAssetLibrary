import { MongoHelper } from 'MongoHelper'

export async function GetPasswordHash (username: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    username_lower: username.toLocaleLowerCase()
  }, {
    projection: {
      password_hash: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found')
  }

  return operationObject.password_hash
}
