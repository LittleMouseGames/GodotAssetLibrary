import { MongoHelper } from 'core/MongoHelper'

export async function GetAllUserInformation (token: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      _id: 0,
      password: 0,
      password_hash: 0,
      resume_tokens: 0
    }
  })

  return operationObject
}
