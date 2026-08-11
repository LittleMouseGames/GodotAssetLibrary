import { MongoHelper } from 'core/MongoHelper'

/**
 * Record README fetch state (observability + retry signal) on the asset.
 *
 * @param {string} assetId
 * @param {{ status: string; error?: string }} state
 */
export async function UpdateAssetReadmeState (
  assetId: string,
  state: { status: string, error?: string }
): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  await mongo.collection('assets').updateOne(
    { asset_id: assetId },
    {
      $set: {
        readme_status: state.status,
        readme_fetched_at: new Date(),
        readme_error: state.error ?? ''
      }
    }
  )
}
