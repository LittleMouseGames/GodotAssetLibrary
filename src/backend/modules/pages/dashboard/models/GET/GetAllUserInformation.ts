import { MongoHelper } from 'MongoHelper'

export async function GetAllUserInformation (token: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  })

  return operationObject
}
