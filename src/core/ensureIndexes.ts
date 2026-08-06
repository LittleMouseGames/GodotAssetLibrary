import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'

export async function ensureIndexes (): Promise<void> {
  try {
    const db = MongoHelper.getDatabase()
    const assets = db.collection('assets')
    const users = db.collection('users')
    const info = db.collection('info')

    const reviews = db.collection('reviews')
    const reports = db.collection('reports')

    // Keep startup memory and pool use predictable. Existing indexes return quickly.
    const indexOperations: Array<() => Promise<string>> = [
      async () => await assets.createIndex({ legacy_asset_id: 1 }),
      async () => await assets.createIndex({ asset_id: 1 }),
      async () => await assets.createIndex({ category_lowercase: 1 }),
      async () => await assets.createIndex({ author_lowercase: 1 }),
      async () => await assets.createIndex({ godot_version: 1 }),
      async () => await assets.createIndex({ featured: 1 }),
      async () => await assets.createIndex({ added_date: -1 }),
      async () => await assets.createIndex({ modify_date: -1 }),
      async () => await assets.createIndex({ upvotes: -1, godot_version: -1 }),
      async () => await users.createIndex({ 'resume_tokens.token': 1 }),
      async () => await users.createIndex({ username: 1 }),
      async () => await users.createIndex({ username_lowercase: 1 }),
      async () => await users.createIndex({ human_id: 1 }),
      async () => await reviews.createIndex({ asset_id: 1 }),
      async () => await reviews.createIndex({ user_id: 1, asset_id: 1 }),
      async () => await reviews.createIndex({ human_id: 1 }),
      async () => await reports.createIndex({ type: 1, ignored: 1, approved: 1 }),
      async () => await reports.createIndex({ human_id: 1 }),
      async () => await info.createIndex({ type: 1 })
    ]

    for (const createIndex of indexOperations) {
      await createIndex()
    }

    logger.log('info', 'Indexes verified')
  } catch (e: any) {
    logger.log('warn', `Index creation failed: ${e?.message ?? e}`, [e])
  }
}
