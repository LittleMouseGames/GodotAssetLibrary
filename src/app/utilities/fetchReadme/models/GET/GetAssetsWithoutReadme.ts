import { FindCursor } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'

interface AssetReadmeRef {
  asset_id: string
  download_url: string
}

export function GetAssetsWithoutReadme (): FindCursor<AssetReadmeRef> {
  const mongo = MongoHelper.getDatabase()
  return mongo.collection<AssetReadmeRef>('assets').find({ readme: null }, {
    projection: { download_url: 1, asset_id: 1 }
  })
}
