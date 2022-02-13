import { MongoHelper } from 'MongoHelper'

export async function UpdateUserInformtaion (token: string, username: string, email: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').updateOne({
    'resume_tokens.token': token
  }, {
    $set: {
      username: username,
      email: email
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update user information')
  }

  return operationObject
}
