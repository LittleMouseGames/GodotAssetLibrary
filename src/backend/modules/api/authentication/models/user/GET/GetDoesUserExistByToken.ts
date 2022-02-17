import { MongoHelper } from 'MongoHelper'

export async function GetDoesUserExistByToken (token: string): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      human_id: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('User not found, are you logged in?')
  }

  return true
}
