import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'

export async function ensureIndexes (): Promise<void> {
  try {
    const db = MongoHelper.getDatabase()
    const assets = db.collection('assets')
    const users = db.collection('users')
    const info = db.collection('info')

    await Promise.all([
      assets.createIndex({ legacy_asset_id: 1 }),
      assets.createIndex({ asset_id: 1 }),
      assets.createIndex({ category_lowercase: 1 }),
      assets.createIndex({ godot_version: 1 }),
      assets.createIndex({ added_date: -1 }),
      assets.createIndex({ modify_date: -1 }),
      assets.createIndex({ upvotes: -1 }),
      // every authenticated request queries users by this nested array field
      users.createIndex({ 'resume_tokens.token': 1 }),
      info.createIndex({ type: 1 })
    ])

    logger.log('info', 'Indexes verified')
  } catch (e: any) {
    logger.log('warn', `Index creation failed: ${e?.message ?? e}`, [e])
  }
}
