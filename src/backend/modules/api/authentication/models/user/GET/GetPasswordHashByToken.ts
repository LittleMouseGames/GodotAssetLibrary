import { MongoHelper } from 'MongoHelper'

export async function GetPasswordHashByToken (token: string): Promise<string> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
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
