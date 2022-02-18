import { MongoHelper } from 'MongoHelper'

export async function GetDoesUsernameExist (username: string): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    username_lower: username.toLocaleLowerCase()
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}
