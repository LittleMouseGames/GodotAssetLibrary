import { MongoHelper } from 'MongoHelper'

export async function GetIsAccountDisabledByToken (hashedToken: string): Promise<boolean> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('users').findOne({
    'resume_tokens.token': hashedToken
  }, {
    projection: {
      account_disabled: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return true
  }

  return operationObject.account_disabled
}
