import { MongoHelper } from 'MongoHelper'

export async function GetUserByToken (token: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const userObj = await mongo.collection('users').findOne({
    'resume_tokens.token': token
  }, {
    projection: {
      human_id: 1
    }
  })

  if (userObj === null || userObj === undefined) {
    throw new Error('User not found')
  }

  return userObj.humanId
}
