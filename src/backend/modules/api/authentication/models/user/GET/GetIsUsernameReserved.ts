import { MongoHelper } from 'MongoHelper'

export async function GetIsUsernameReserved (username: string): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({
    author_lowercase: username.toLocaleLowerCase()
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}
