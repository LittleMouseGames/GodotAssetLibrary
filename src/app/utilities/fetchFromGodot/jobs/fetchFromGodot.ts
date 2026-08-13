import { CronJob } from 'cron'
import { logger } from 'core/utils/logger'
import { nodeFetch } from 'core/utils/nodeFetch'
import { customAlphabet } from 'nanoid/non-secure'
import { MongoHelper } from 'core/MongoHelper'
import { Db } from 'mongodb'
import { assetSchema } from '../schema/assets'
import { GODOT_ASSET_LIBRARY_PROVIDER } from 'core/utils/assetProvider'
import { normalizeRepositoryUrl } from 'core/utils/repositoryNormalization'
import { FetchReadme } from 'app/utilities/fetchReadme/services/FetchReadme'
import { parseGodotMajor } from 'core/utils/godotVersionPreference'

const host = 'godotengine.org'
let importRunning = false

/**
 * Fetch asset listings and mirror from old library
 *
 * Fetches the assets from godots old library
 * so that we can import / mirror them on our site
 *
 * While this isn't a very beefy (big) command,
 * its good to be good neighbours and try
 * to limit any potential impact by choosing very
 * off-hour times (as much as resonably possible)
 */
export const fetchAssetsFromGodot = new CronJob('0 1 * * *', function () {
  void runImportAssets().catch((error: any) => {
    logger.log('error', `Asset import failed: ${error?.message ?? error}`)
  })
})

/**
 * What this does:
 * - fetchs the links specified in `paths` variable
 * - checks each entry in JSON there against what we have in the DB
 *   - if we don't have it
 *     - pull in that asset
 *   - if we do have it
 *     - if ours is newer, skip
 *     - if theirs is newer, merge info
 */
export async function runImportAssets (): Promise<void> {
  if (importRunning) {
    logger.log('warn', 'Skipping asset import because the previous run is still active')
    return
  }

  importRunning = true
  try {
    await importAssets()
  } finally {
    importRunning = false
  }
}

async function importAssets (): Promise<void> {
  logger.log('info', 'Fetching data to mirror from Godot Asset Library')
  const syncedAt = new Date()

  const { newAssetIDs, updateAssetIDs, seenIDs, partialRun } = await fetchAssetListings()
  await fetchAssetInformationAndInsert(newAssetIDs)
  await fetchAssetInformationAndUpdate(updateAssetIDs)

  if (partialRun) {
    // Do not advance missing-run counters or tombstone anything when the
    // listing was incomplete; that would wrongly hide healthy assets.
    logger.log('warn', 'Asset listing was partial; skipping source-status marking')
  } else {
    await markSourceStatus(seenIDs, syncedAt)
  }

  logger.log('info', `All imported assets processed (${newAssetIDs.length} new, ${updateAssetIDs.length} updated)`)
}

async function fetchAssetListings (): Promise<{ newAssetIDs: string[], updateAssetIDs: string[], seenIDs: Set<string>, partialRun: boolean }> {
  const env = process.env.RUN_MODE ?? 'prod'
  const maxResults = env === 'devel' ? 50 : 500
  const versionWindows = (env === 'devel'
    ? ['3.4']
    : (process.env.IMPORT_GODOT_VERSIONS ?? '2.2,3.9,4.9').split(',')).map(v => v.trim()).filter(Boolean)

  const newAssetIDs = new Set<string>()
  const updateAssetIDs = new Set<string>()
  const seenIDs = new Set<string>()

  // A failed version window means `seenIDs` is incomplete. Marking source
  // status from a partial set would wrongly tombstone healthy assets, so the
  // caller must skip availability marking when this is true.
  let anyWindowFailed = false

  for (const version of versionWindows) {
    let page = 0
    while (page < 100) {
      const path = `/asset-library/api/asset?type=any&max_results=${maxResults}&godot_version=${encodeURIComponent(version)}&page=${page}`
      let result: any[]
      try {
        /**
         * We run these sequentially so as to
         * minimize any potential negative impact
         * to their servers
         */
        const response = await nodeFetch({ host, path })
        result = JSON.parse(response).result
      } catch (e: any) {
        logger.log('error', `[IMPORTER]: ${e.message}`, [e])
        anyWindowFailed = true
        break
      }

      if (!Array.isArray(result) || result.length === 0) break

      for (const asset of result) {
        if (asset.asset_id === undefined) continue
        seenIDs.add(asset.asset_id)
        if (!(await modelDoesAssetAlreadyExist(asset.asset_id))) {
          newAssetIDs.add(asset.asset_id)
        } else {
          const assetModifiedDate = await modelGetAssetModifiedDate(asset.asset_id)
          if (new Date(asset.modify_date) > new Date(assetModifiedDate)) {
            updateAssetIDs.add(asset.asset_id)
          }
        }
      }

      // A short (or empty) page means we reached the end of this version window.
      if (result.length < maxResults) break
      page++
    }
  }

  return {
    newAssetIDs: Array.from(newAssetIDs),
    updateAssetIDs: Array.from(updateAssetIDs),
    seenIDs,
    partialRun: anyWindowFailed
  }
}

/** Record freshness/source-status fields on an asset before persisting it. */
function normalizeAssetForSync (asset: any, isNew: boolean): void {
  // Source-qualified identity: every record belongs to exactly one provider
  // and carries a provider-scoped source identity so the Store importer can
  // never be reconciled away by the legacy job (and vice versa).
  asset.provider = GODOT_ASSET_LIBRARY_PROVIDER
  asset.source_asset_id = asset.legacy_asset_id
  asset.normalized_repository = normalizeRepositoryUrl(asset.browse_url) ?? undefined
  // Backward-compatible array projection used by unified major-line browsing.
  const major = parseGodotMajor(asset.godot_version)
  if (major !== undefined) {
    asset.godot_major = major
  }
  asset.godot_majors = major !== undefined ? [major] : []
  asset.source_last_seen_at = new Date()
  asset.source_last_synced_at = new Date()
  asset.source_status = 'active'
  // Denormalized public-catalog flag (migration 0006 + markSourceStatus keep
  // it current). source_status is 'active' here, so only the upstream
  // `searchable` flag decides visibility.
  asset.is_public = asset.searchable !== 'false'
  if (isNew) {
    asset.source_missing_runs = 0
  }
  const modifyDate = new Date(asset.modify_date)
  if (!isNaN(modifyDate.getTime())) {
    asset.modify_date_at = modifyDate
  }
}

/**
 * After a complete import, mark seen assets active/synced and tombstone assets
 * that several consecutive imports no longer list.
 */
async function markSourceStatus (seenIDs: Set<string>, syncedAt: Date): Promise<void> {
  const mongo: Db = MongoHelper.getDatabase()
  const assets = mongo.collection('assets')
  const seen = Array.from(seenIDs)

  // Every query is provider-scoped: a complete legacy import only ever marks
  // legacy records, and a complete Store import only marks Store records, so
  // one source can never tombstone the other's healthy records.
  const provider = { provider: GODOT_ASSET_LIBRARY_PROVIDER }

  await assets.updateMany(
    { ...provider, legacy_asset_id: { $in: seen } },
    {
      $set: { source_status: 'active', source_last_seen_at: syncedAt, source_last_synced_at: syncedAt },
      $unset: { source_missing_runs: '' }
    }
  )

  // Keep the denormalized is_public flag current for still-listed assets:
  // active + searchable -> public, active + non-searchable -> hidden.
  await assets.updateMany(
    { ...provider, legacy_asset_id: { $in: seen }, searchable: { $ne: 'false' } },
    { $set: { is_public: true } }
  )
  await assets.updateMany(
    { ...provider, legacy_asset_id: { $in: seen }, searchable: 'false' },
    { $set: { is_public: false } }
  )

  await assets.updateMany(
    { ...provider, legacy_asset_id: { $nin: seen }, source_status: { $ne: 'unavailable' } },
    { $inc: { source_missing_runs: 1 } }
  )

  await assets.updateMany(
    { ...provider, legacy_asset_id: { $nin: seen }, source_missing_runs: { $gte: 3 } },
    { $set: { source_status: 'unavailable', is_public: false } }
  )
}

async function fetchAssetInformationAndInsert (assetIDs: any[]): Promise<void> {
  for (const assetID of assetIDs) {
    try {
      /**
       * We run these sequentially so as to
       * minimize any potential negative impact
       * to their servers
       */
      const response = await nodeFetch({
        host,
        path: `/asset-library/api/asset/${assetID}`
      })

      const result = JSON.parse(response) as assetSchema

      if (result.asset_id !== undefined) {
        normalizeAssetForSync(result, true)
        await modelInsertAsset(result)
        await updateCategoryCountInfoObject(result.category)
        await FetchReadme(result.asset_id, result.download_url)
      }
    } catch (e: any) {
      logger.log('error', `[IMPORTER]: ${e.message}`, [e])
    }
  }
}

async function fetchAssetInformationAndUpdate (assetIDs: any[]): Promise<void> {
  for (const assetID of assetIDs) {
    try {
      /**
       * We run these sequentially so as to
       * minimize any potential negative impact
       * to their servers
       */
      const response = await nodeFetch({
        host,
        path: `/asset-library/api/asset/${assetID}`
      })

      const result = JSON.parse(response) as assetSchema

      if (result.asset_id !== undefined) {
        const assetInformationWeHave = await modelGetAssetInformation(result.asset_id)

        result.legacy_asset_id = result.asset_id
        result.asset_id = assetInformationWeHave.asset_id
        result.title = result.title.trim()
        result.category_lowercase = result.category.toLocaleLowerCase()
        result.author_lowercase = result.author.toLocaleLowerCase()
        result.quick_description = result.description.trim().replace(/(\r\n|\n|\r|\t)/gm, '')

        for (const preview of result.previews) {
          if (preview !== undefined && (result.card_banner === '' || result.card_banner === undefined)) {
            result.card_banner = preview.thumbnail
            break
          }
        }

        if (assetInformationWeHave.category !== result.category) {
          await updateCategoryCountInfoObject(assetInformationWeHave.category, -1)
          await updateCategoryCountInfoObject(result.category)
        }

        normalizeAssetForSync(result, false)
        await FetchReadme(result.asset_id, result.download_url)
        await modelUpdateAssetObject(result.legacy_asset_id, result)
      }
    } catch (e: any) {
      logger.log('error', `[IMPORTER]: ${e.message}`, [e])
    }
  }
}

async function modelDoesAssetAlreadyExist (legacyAssetID: string): Promise<boolean> {
  const mongo: Db = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({
    provider: GODOT_ASSET_LIBRARY_PROVIDER,
    legacy_asset_id: legacyAssetID
  }, {
    projection: {
      asset_id: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}

async function modelGetAssetModifiedDate (legacyAssetID: string): Promise<string> {
  const mongo: Db = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({
    provider: GODOT_ASSET_LIBRARY_PROVIDER,
    legacy_asset_id: legacyAssetID
  }, {
    projection: {
      modify_date: 1
    }
  })

  return operationObject?.modify_date
}

async function updateCategoryCountInfoObject (name: string, increment: number = 1): Promise<void> {
  const mongo: Db = MongoHelper.getDatabase()
  const category = String(`category.${name}`)
  await mongo.collection('info').updateOne({
    type: 'category_count'
  }, {
    $inc: {
      [category]: increment
    }
  }, {
    upsert: true
  })
}

async function modelUpdateAssetObject (assetId: string, assetObject: object): Promise<void> {
  const mongo: Db = MongoHelper.getDatabase()
  await mongo.collection('assets').updateOne({
    provider: GODOT_ASSET_LIBRARY_PROVIDER,
    legacy_asset_id: assetId
  }, {
    $set: assetObject
  })
}

async function modelInsertAsset (asset: assetSchema): Promise<any> {
  const mongo: Db = MongoHelper.getDatabase()
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 6)

  // TODO: Move out of model
  asset.legacy_asset_id = asset.asset_id
  asset.asset_id = nanoid()
  // Source-qualified identity for a brand-new legacy record. Updates never
  // reset these (group_preferred/link state is owned by the linking service).
  asset.provider = GODOT_ASSET_LIBRARY_PROVIDER
  asset.source_asset_id = asset.legacy_asset_id
  asset.group_id = asset.asset_id
  asset.group_preferred = true
  asset.is_group_root = true
  asset.quick_description = asset.description.trim().replace(/(\r\n|\n|\r|\t)/gm, '')
  asset.upvotes = 0
  asset.downvotes = 0
  asset.rating_score = 0
  asset.featured = false
  asset.title = asset.title.trim()
  asset.category_lowercase = asset.category.toLocaleLowerCase()
  asset.author_lowercase = asset.author.toLocaleLowerCase()
  asset.added_date = new Date()

  for (const preview of asset.previews) {
    if (preview !== undefined && (asset.card_banner === '' || asset.card_banner === undefined)) {
      asset.card_banner = preview.thumbnail
      break
    }
  }

  return await mongo.collection('assets').insertOne(asset)
}

async function modelGetAssetInformation (legacyAssetID: string): Promise<any> {
  const mongo: Db = MongoHelper.getDatabase()
  return await mongo.collection('assets').findOne({
    provider: GODOT_ASSET_LIBRARY_PROVIDER,
    legacy_asset_id: legacyAssetID
  }, {
    projection: {
      _id: 0,
      asset_id: 1,
      category: 1
    }
  })
}
