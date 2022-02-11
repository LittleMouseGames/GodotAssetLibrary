import { MongoHelper } from 'MongoHelper'

export async function GetPasswordHash (username: string): Promise<any> {
  const mongo = MongoHelper.getDatabase()
  const userObj = await mongo.collection('users').findOne({
    username: username
  }, {
    projection: {
      password: 1
    }
  })

  if (userObj === null || userObj === undefined) {
    throw new Error('User not found')
  }

  return userObj
}
