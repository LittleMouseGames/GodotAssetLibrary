import { Collection, Document } from 'mongodb'
import { MongoHelper } from 'core/MongoHelper'
import { logger } from 'core/utils/logger'
import { buildSearchFilter } from 'app/code/search/models/GET/buildSearchFilter'
import { PUBLIC_ASSET_FILTER } from 'core/utils/publicCatalog'

/**
 * Read-only query-shape baseline audit.
 *
 * Runs `explain("executionStats")` on the hot discovery/PDP query shapes and
 * prints, for each: execution time, documents/keys examined, rows returned,
 * and the winning plan's stage signature (e.g. IXSCAN > SORT vs COLLSCAN).
 * Capture this BEFORE and AFTER index/query changes so capacity decisions are
 * driven by measurements, not guesses. It never mutates data. Execute via
 * `npm run audit:queries`.
 */

interface WalkedStats {
  docs: number
  keys: number
  returned: number
  stages: string[]
}

/** Recursively walk an executionStages tree, summing examined docs/keys. */
function walkStages (node: any, acc: WalkedStats): void {
  if (node === null || typeof node !== 'object') return
  if (typeof node.stage === 'string') acc.stages.push(node.stage)
  if (typeof node.totalDocsExamined === 'number') acc.docs += Number(node.totalDocsExamined)
  if (typeof node.totalKeysExamined === 'number') acc.keys += Number(node.totalKeysExamined)
  if (typeof node.nReturned === 'number') acc.returned = Math.max(acc.returned, node.nReturned)
  const child = node.inputStage ?? node.inputStages
  if (child !== undefined && child !== null) {
    const list = Array.isArray(child) ? child : [child]
    for (const item of list) walkStages(item, acc)
  }
}

function report (label: string, explain: any): void {
  const stats = explain?.executionStats ?? {}
  const walked: WalkedStats = { docs: 0, keys: 0, returned: 0, stages: [] }
  if (stats.executionStages !== undefined) {
    walkStages(stats.executionStages, walked)
  } else {
    walked.docs = stats.totalDocsExamined ?? 0
    walked.keys = stats.totalKeysExamined ?? 0
    walked.returned = stats.nReturned ?? 0
  }
  const ms = stats.executionTimeMillis ?? 0
  logger.log('info',
    `${label.padEnd(44)} ms=${String(ms).padStart(5)} docs=${String(walked.docs).padStart(6)} ` +
    `keys=${String(walked.keys).padStart(6)} ret=${String(walked.returned).padStart(4)} [${walked.stages.join(' > ')}]`)
}

async function explainFind (
  label: string,
  assets: Collection,
  filter: Document,
  options: Document = {}
): Promise<void> {
  try {
    const explain = await assets.find(filter, options).explain('executionStats')
    report(label, explain)
  } catch (error: any) {
    logger.log('warn', `${label}: explain failed: ${error?.message ?? error}`)
  }
}

async function explainAggregate (label: string, assets: Collection, pipeline: Document[]): Promise<void> {
  try {
    const explain = await assets.aggregate(pipeline).explain('executionStats')
    report(label, explain)
  } catch (error: any) {
    logger.log('warn', `${label}: explain failed: ${error?.message ?? error}`)
  }
}

const SEARCH_PROJECTION: Record<string, number> = {
  category: 1,
  category_lowercase: 1,
  godot_version: 1,
  author: 1,
  title: 1,
  quick_description: 1,
  icon_url: 1,
  upvotes: 1,
  downvotes: 1,
  rating_score: 1,
  featured: 1,
  asset_id: 1,
  previews: 1,
  card_banner: 1,
  modify_date: 1,
  modify_date_at: 1,
  added_date: 1,
  version_string: 1,
  type: 1,
  support_level: 1,
  download_url: 1
}

/** The hot browse/results shape: one $match feeding a results+total $facet. */
function searchPipeline (filter: Document, sort: Document, skip = 0, limit = 12): Document[] {
  return [
    { $match: filter },
    {
      $facet: {
        results: [{ $sort: sort }, { $skip: skip }, { $limit: limit }, { $project: SEARCH_PROJECTION }],
        total: [{ $count: 'n' }]
      }
    }
  ]
}

export async function runQueryAudit (): Promise<void> {
  const db = MongoHelper.getDatabase()
  const assets = db.collection('assets')
  const users = db.collection('users')

  // Use real sample values so examined-doc numbers are realistic.
  const sampleAsset = await assets.findOne(PUBLIC_ASSET_FILTER, {
    projection: { asset_id: 1, category_lowercase: 1, godot_version: 1, type: 1 }
  })
  const sampleAssetId = sampleAsset?.asset_id ?? 'none'
  const sampleCategory = sampleAsset?.category_lowercase ?? '2d tools'
  const sampleEngine = sampleAsset?.godot_version ?? '3.4'
  const sampleType = sampleAsset?.type ?? 'addon'
  const sampleUser = await users.findOne({}, { projection: { _id: 1 } })
  const sampleUserId = sampleUser !== null ? String(sampleUser._id) : 'none'

  logger.log('info', '--- Query audit (executionStats) start ---')
  logger.log('info', `sample: asset=${sampleAssetId} category=${sampleCategory} engine=${sampleEngine} type=${sampleType}`)

  // Homepage shapes.
  await explainFind('homepage: trending', assets, PUBLIC_ASSET_FILTER,
    { sort: { rating_score: -1, upvotes: -1, downvotes: -1, asset_id: 1 }, limit: 8 })
  await explainFind('homepage: featured', assets, { ...PUBLIC_ASSET_FILTER, featured: true },
    { sort: { rating_score: -1, asset_id: 1 }, limit: 4 })
  await explainFind('homepage: recently updated', assets, PUBLIC_ASSET_FILTER,
    { sort: { modify_date_at: -1, asset_id: 1 }, limit: 8 })
  await explainAggregate('homepage: category counts', assets, [
    { $match: PUBLIC_ASSET_FILTER },
    { $group: { _id: '$category_lowercase', count: { $sum: 1 } } }
  ])

  // Search / taxonomy shapes.
  const browseAll = buildSearchFilter('')
  const browse2d = buildSearchFilter('', { categories: [sampleCategory] })
  const filtered = buildSearchFilter('', { types: [sampleType], supports: ['official'] })
  const textFilter = buildSearchFilter('shader')
  const textAndFilters = buildSearchFilter('shader', { types: [sampleType] })

  await explainAggregate('search: browse all (results+count)', assets,
    searchPipeline(browseAll, { modify_date_at: -1, asset_id: 1 }))
  await explainAggregate('search: category browse', assets,
    searchPipeline(browse2d, { modify_date_at: -1, asset_id: 1 }))
  await explainAggregate('search: text (results+count)', assets,
    searchPipeline(textFilter, { score: { $meta: 'textScore' }, asset_id: 1 }))
  await explainAggregate('search: filtered browse facet', assets, [
    { $match: filtered },
    { $group: { _id: '$category_lowercase', count: { $sum: 1 } } }
  ])
  await explainAggregate('search: text + filters facet', assets, [
    { $match: textAndFilters },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ])

  // PDP shapes.
  await explainFind('pdp: asset by id', assets, { asset_id: sampleAssetId }, { limit: 1 })
  await explainFind('pdp: related assets', assets,
    { ...PUBLIC_ASSET_FILTER, asset_id: { $ne: 'none' }, category_lowercase: sampleCategory },
    { sort: { rating_score: -1, upvotes: -1, asset_id: 1 }, limit: 12 })
  await explainFind('pdp: reviews by asset', db.collection('reviews'),
    { asset_id: sampleAssetId },
    { sort: { date: -1, _id: -1 }, skip: 0, limit: 10 })
  await explainAggregate('pdp: review count', db.collection('reviews'), [
    { $match: { asset_id: sampleAssetId } },
    { $count: 'n' }
  ])

  // Account shapes.
  await explainFind('dashboard: user reviews', db.collection('reviews'),
    { user_id: sampleUserId },
    { sort: { date: -1, _id: -1 }, skip: 0, limit: 10 })

  logger.log('info', '--- Query audit complete ---')
}
