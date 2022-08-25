import { MongoHelper } from 'core/MongoHelper'

export async function UpdateAssetReadme (assetId: string, readme: string): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  await mongo.collection('assets').updateOne({ asset_id: assetId }, {
    $set: {
      readme: readme
    }
  })
}
