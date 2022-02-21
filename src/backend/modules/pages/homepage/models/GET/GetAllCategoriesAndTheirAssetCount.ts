import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'

interface ReturnedCategories extends WithId<Document> {
  type: string
  category: {
    [key: string]: string
  }
}

export async function GetAllCategoriesAndTheirAssetCount (): Promise<Object> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').findOne({ type: 'category_count' }) as ReturnedCategories

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No categories found')
  }

  return operationObject.category
}
