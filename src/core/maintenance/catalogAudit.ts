import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'

/**
 * Read-only catalog health audit.
 *
 * Reports duplicates, rating vote drift, data coverage, and current indexes.
 * It never mutates data — run it against a production snapshot before any
 * uniqueness or text-index migration. Execute via `npm run audit:catalog`.
 */
export async function runCatalogAudit (): Promise<void> {
  const db = MongoHelper.getDatabase()
  const assets = db.collection('assets')
  const reviews = db.collection('reviews')

  logger.log('info', '--- Catalog audit start ---')

  const totalAssets = await assets.countDocuments({})
  logger.log('info', `total assets: ${totalAssets}`)

  // Current indexes
  const indexes = await assets.indexes()
  logger.log('info', `assets index names: ${indexes.map(i => i.name).join(', ')}`)

  // Duplicate asset_id
  const duplicateAssetIds = await assets.aggregate([
    { $group: { _id: '$asset_id', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 }
  ]).toArray()
  logger.log('info', `duplicate asset_id groups: ${JSON.stringify(duplicateAssetIds)}`)

  // Duplicate legacy_asset_id
  const duplicateLegacyIds = await assets.aggregate([
    { $match: { legacy_asset_id: { $type: 'string' } } },
    { $group: { _id: '$legacy_asset_id', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 }
  ]).toArray()
  logger.log('info', `duplicate legacy_asset_id groups: ${JSON.stringify(duplicateLegacyIds)}`)

  // Duplicate reviews by (user_id, asset_id)
  const duplicateReviews = await reviews.aggregate([
    { $group: { _id: { user_id: '$user_id', asset_id: '$asset_id' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 }
  ]).toArray()
  logger.log('info', `duplicate review groups: ${JSON.stringify(duplicateReviews)}`)

  // Vote drift: stored upvotes/downvotes vs counts derived from canonical reviews
  const reviewCounts = await reviews.aggregate([
    {
      $group: {
        _id: '$asset_id',
        positive: { $sum: { $cond: [{ $eq: ['$review_type', 'positive'] }, 1, 0] } },
        negative: { $sum: { $cond: [{ $eq: ['$review_type', 'negative'] }, 1, 0] } }
      }
    },
    { $limit: 500 }
  ]).toArray()

  let driftCount = 0
  const driftSamples: unknown[] = []
  for (const row of reviewCounts) {
    const asset = await assets.findOne({ asset_id: row._id }, { projection: { upvotes: 1, downvotes: 1 } })
    if (asset !== null && (asset.upvotes !== row.positive || asset.downvotes !== row.negative)) {
      driftCount++
      if (driftSamples.length < 10) {
        driftSamples.push({
          asset_id: row._id,
          stored: { upvotes: asset.upvotes, downvotes: asset.downvotes },
          derived: { positive: row.positive, negative: row.negative }
        })
      }
    }
  }
  logger.log('info', `assets with vote drift (of first 500 reviewed): ${driftCount}`)
  logger.log('info', `vote drift samples: ${JSON.stringify(driftSamples)}`)

  // Field coverage
  const fieldsToCheck = [
    'type',
    'cost',
    'support_level',
    'searchable',
    'rating',
    'godot_version',
    'download_hash',
    'download_provider',
    'modify_date',
    'added_date',
    'browse_url',
    'issues_url'
  ]
  for (const field of fieldsToCheck) {
    const missing = await assets.countDocuments({ [field]: { $exists: false } })
    logger.log('info', `field ${field}: missing ${missing}/${totalAssets}`)
  }

  // Invalid modify_date (present but not a Date)
  const invalidModifyDates = await assets.countDocuments({
    modify_date: { $exists: true, $not: { $type: 'date' } }
  })
  logger.log('info', `modify_date present but not a Date: ${invalidModifyDates}`)

  // Category / engine cardinality and top values
  const categories = await assets.distinct('category')
  const engines = await assets.distinct('godot_version')
  logger.log('info', `category cardinality: ${categories.length}`)
  logger.log('info', `engine cardinality: ${engines.length}; values: ${engines.join(', ')}`)

  logger.log('info', '--- Catalog audit complete ---')
}
