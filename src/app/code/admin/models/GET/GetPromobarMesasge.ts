import { MongoHelper } from 'core/MongoHelper'

export async function GetPromobarMessage (): Promise<string> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').findOne({
    type: 'promobar_message'
  }, {
    projection: {
      message: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Promobar message not found')
  }

  return operationObject.message
}
