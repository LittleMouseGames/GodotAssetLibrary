import { Db } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { TEXT_INDEX_NAME } from 'core/migrations/0001-create-text-index'

interface IndexOperation {
  name: string
  run: () => Promise<unknown>
}

/**
 * Create/verify the application's MongoDB indexes.
 *
 * Each index is attempted INDEPENDENTLY: a failure in one is logged but never
 * aborts the remaining indexes (matching the migration runner), so a single
 * bad/conflicting/legacy index can't leave the whole collection missing the
 * rest of its schema. This function never throws — startup treats it as a
 * best-effort safety net.
 *
 * `dbOverride` is injectable for tests; production callers omit it and the
 * active MongoHelper database is used.
 */
export async function ensureIndexes (dbOverride?: Db): Promise<void> {
  const db = dbOverride ?? MongoHelper.getDatabase()
  const assets = db.collection('assets')
  const users = db.collection('users')
  const info = db.collection('info')

  const reviews = db.collection('reviews')
  const reports = db.collection('reports')

  // Keep startup memory and pool use predictable. Existing indexes return
  // quickly, so this is a cheap idempotent check on every boot.
  const indexOperations: IndexOperation[] = [
    { name: 'assets.legacy_asset_id', run: async () => await assets.createIndex({ legacy_asset_id: 1 }) },
    { name: 'assets.asset_id', run: async () => await assets.createIndex({ asset_id: 1 }) },
    { name: 'assets.category_lowercase', run: async () => await assets.createIndex({ category_lowercase: 1 }) },
    { name: 'assets.author_lowercase', run: async () => await assets.createIndex({ author_lowercase: 1 }) },
    { name: 'assets.godot_version', run: async () => await assets.createIndex({ godot_version: 1 }) },
    { name: 'assets.featured', run: async () => await assets.createIndex({ featured: 1 }) },
    { name: 'assets.added_date', run: async () => await assets.createIndex({ added_date: -1 }) },
    { name: 'assets.modify_date', run: async () => await assets.createIndex({ modify_date: -1 }) },
    { name: 'assets.upvotes_godot_version', run: async () => await assets.createIndex({ upvotes: -1, godot_version: -1 }) },
    { name: 'assets.rating_score_asset_id', run: async () => await assets.createIndex({ rating_score: -1, asset_id: 1 }) },
    { name: 'assets.modify_date_at_asset_id', run: async () => await assets.createIndex({ modify_date_at: -1, asset_id: 1 }) },
    { name: 'assets.godot_major_modify_date_at', run: async () => await assets.createIndex({ godot_major: 1, modify_date_at: -1, asset_id: 1 }) },
    { name: 'assets.godot_major_rating', run: async () => await assets.createIndex({ godot_major: 1, rating_score: -1, upvotes: -1, downvotes: -1, asset_id: 1 }) },
    { name: 'assets.category_version_rating', run: async () => await assets.createIndex({ category_lowercase: 1, godot_version: 1, rating_score: -1, asset_id: 1 }) },
    { name: 'assets.category_major_rating', run: async () => await assets.createIndex({ category_lowercase: 1, godot_major: 1, rating_score: -1, asset_id: 1 }) },
    { name: 'assets.category_rating_upvotes', run: async () => await assets.createIndex({ category_lowercase: 1, rating_score: -1, upvotes: -1, asset_id: 1 }) },
    { name: 'users.resume_tokens.token', run: async () => await users.createIndex({ 'resume_tokens.token': 1 }) },
    { name: 'users.username', run: async () => await users.createIndex({ username: 1 }) },
    { name: 'users.username_lowercase', run: async () => await users.createIndex({ username_lowercase: 1 }) },
    { name: 'users.human_id', run: async () => await users.createIndex({ human_id: 1 }) },
    { name: 'reviews.asset_id', run: async () => await reviews.createIndex({ asset_id: 1 }) },
    { name: 'reviews.user_id_asset_id', run: async () => await reviews.createIndex({ user_id: 1, asset_id: 1 }) },
    { name: 'reviews.asset_id_date_id', run: async () => await reviews.createIndex({ asset_id: 1, date: -1, _id: -1 }) },
    { name: 'reviews.user_id_date_id', run: async () => await reviews.createIndex({ user_id: 1, date: -1, _id: -1 }) },
    { name: 'reviews.human_id', run: async () => await reviews.createIndex({ human_id: 1 }) },
    { name: 'reports.type_ignored_approved', run: async () => await reports.createIndex({ type: 1, ignored: 1, approved: 1 }) },
    { name: 'reports.human_id', run: async () => await reports.createIndex({ human_id: 1 }) },
    { name: 'info.type', run: async () => await info.createIndex({ type: 1 }) }
  ]

  const failures: string[] = []
  for (const operation of indexOperations) {
    try {
      await operation.run()
    } catch (error: any) {
      failures.push(operation.name)
      logger.log('warn', `Index ${operation.name} creation failed (continuing with remaining indexes): ${error?.message ?? error}`)
    }
  }

  // The weighted text index is deployment-managed through `npm run migrate`
  // because MongoDB only allows one text index per collection. Verify here so
  // a missing text index surfaces clearly instead of at query time.
  try {
    const existingIndexes = await assets.indexes()
    const hasTextIndex = existingIndexes.some(index =>
      index.key !== undefined && Object.values(index.key).some(value => value === 'text')
    )
    if (!hasTextIndex) {
      logger.log('warn', `Text index (${TEXT_INDEX_NAME}) is missing. Run "npm run migrate" before relying on search.`)
    } else {
      logger.log('info', `Text index (${TEXT_INDEX_NAME}) verified`)
    }
  } catch (error: any) {
    failures.push('assets.text-index-verification')
    logger.log('warn', `Text index verification failed: ${error?.message ?? error}`)
  }

  if (failures.length > 0) {
    logger.log('warn', `Index creation finished with ${failures.length} failure(s): ${failures.join(', ')}`)
  } else {
    logger.log('info', 'Indexes verified')
  }
}
