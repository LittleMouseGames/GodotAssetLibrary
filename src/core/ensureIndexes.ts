import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { TEXT_INDEX_NAME } from 'core/migrations/0001-create-text-index'

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
      async () => await assets.createIndex({ rating_score: -1, asset_id: 1 }),
      async () => await assets.createIndex({ modify_date_at: -1, asset_id: 1 }),
      async () => await assets.createIndex({ godot_major: 1, modify_date_at: -1, asset_id: 1 }),
      async () => await assets.createIndex({ godot_major: 1, rating_score: -1, upvotes: -1, downvotes: -1, asset_id: 1 }),
      async () => await assets.createIndex({ category_lowercase: 1, godot_version: 1, rating_score: -1, asset_id: 1 }),
      async () => await assets.createIndex({ category_lowercase: 1, godot_major: 1, rating_score: -1, asset_id: 1 }),
      async () => await users.createIndex({ 'resume_tokens.token': 1 }),
      async () => await users.createIndex({ username: 1 }),
      async () => await users.createIndex({ username_lowercase: 1 }),
      async () => await users.createIndex({ human_id: 1 }),
      async () => await reviews.createIndex({ asset_id: 1 }),
      async () => await reviews.createIndex({ user_id: 1, asset_id: 1 }),
      async () => await reviews.createIndex({ asset_id: 1, date: -1 }),
      async () => await reviews.createIndex({ human_id: 1 }),
      async () => await reports.createIndex({ type: 1, ignored: 1, approved: 1 }),
      async () => await reports.createIndex({ human_id: 1 }),
      async () => await info.createIndex({ type: 1 })
    ]

    for (const createIndex of indexOperations) {
      await createIndex()
    }

    // The weighted text index is deployment-managed through `npm run migrate`
    // because MongoDB only allows one text index per collection. Verify here so
    // readiness fails clearly instead of surfacing "text index required" at query time.
    const existingIndexes = await assets.indexes()
    const hasTextIndex = existingIndexes.some(index =>
      index.key !== undefined && Object.values(index.key).some(value => value === 'text')
    )
    if (!hasTextIndex) {
      logger.log('warn', `Text index (${TEXT_INDEX_NAME}) is missing. Run "npm run migrate" before relying on search.`)
    } else {
      logger.log('info', `Text index (${TEXT_INDEX_NAME}) verified`)
    }

    logger.log('info', 'Indexes verified')
  } catch (e: any) {
    logger.log('warn', `Index creation failed: ${e?.message ?? e}`, [e])
  }
}
