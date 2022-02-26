import { Document, WithId } from 'mongodb'
import { MongoHelper } from 'MongoHelper'
import { assetGridSchema } from 'utility/schema/assets-grid'

interface ReturnedAssets extends WithId<Document>, assetGridSchema {}

export async function GetReviewsByIdList (reviewIdList: any[], limit: number = 12, skip: number, sort: any = {}): Promise<ReturnedAssets[]> {
  const mongo = MongoHelper.getDatabase()

  const operationObject = await mongo.collection('reviews').find({
    human_id: {
      $in: reviewIdList
    }
  }, {
    limit: limit,
    sort: sort
  }).skip(skip).toArray() as ReturnedAssets[]

  if (operationObject === null || operationObject === undefined) {
    throw new Error('No assets found')
  }

  return operationObject
}
