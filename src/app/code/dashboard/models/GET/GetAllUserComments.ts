import { FindCursor } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'

export function GetAllUserComments (userId: string): FindCursor {
  const mongo = MongoHelper.getDatabase()
  return mongo.collection('reviews').find({
    user_id: userId
  }, {
    projection: { _id: 0 },
    batchSize: 100
  })
}
