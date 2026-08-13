/**
 * Godot Asset Store importer.
 *
 * Ingests the official Godot Asset Store (`store.godotengine.org`) through its
 * documented public read-only API (the same contract the Godot editor uses) as
 * a second, source-qualified catalog provider.
 *
 * Guarantees:
 * - Every record is keyed by `(provider, source_asset_id)` with an atomic
 *   upsert, so re-runs and the legacy importer can never create duplicates or
 *   clobber each other's records.
 * - Availability reconciliation is provider-scoped: a complete Store run only
 *   marks Store records, and a partial run never tombstones anything.
 * - Ephemeral signed `download_url` values are NEVER persisted; releases are
 *   stored as metadata only and acquisition links out to the Store page.
 * - New Store records are matched against legacy records by strict normalized
 *   repository + title and auto-linked (store-first) when unambiguous;
 *   everything else goes to the admin review queue (`link_status: 'suggested'`).
 */

import { CronJob } from 'cron'
import crypto from 'crypto'
import { customAlphabet } from 'nanoid/non-secure'
import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'
import { MongoHelper } from 'core/MongoHelper'
import { GODOT_STORE_PROVIDER, GODOT_ASSET_LIBRARY_PROVIDER } from 'core/utils/assetProvider'
import { StoreAssetData } from '../schema/storeApi'
import { createStoreApiClient, StoreApiClient } from '../services/StoreApiClient'
import { normalizeStoreAsset, NormalizedStoreAsset } from '../services/normalizeStoreAsset'
import { evaluateStoreLink, LegacyLinkCandidate, linkStoreToLegacy } from '../services/linkStoreToLegacy'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 6)

let importRunning = false

const parsedConcurrency = Number.parseInt(process.env.STORE_IMPORT_CONCURRENCY ?? '', 10)
const CONCURRENCY = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0 ? parsedConcurrency : 4
const parsedPageSize = Number.parseInt(process.env.STORE_IMPORT_PAGE_SIZE ?? '', 10)
const PAGE_SIZE = Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? Math.min(100, parsedPageSize) : 100
const parsedSweepDays = Number.parseInt(process.env.STORE_IMPORT_SWEEP_DAYS ?? '', 10)
const SWEEP_DAYS = Number.isFinite(parsedSweepDays) && parsedSweepDays > 0 ? parsedSweepDays : 7
const DEV_MAX_PAGES = 1

/**
 * Cron: daily 01:30 (legacy runs at 01:00) so the two importers don't hammer
 * the upstream services at the same instant.
 */
export const fetchAssetsFromGodotStore = new CronJob('30 1 * * *', function () {
  void runImportFromStore().catch((error: any) => {
    logger.log('error', `Godot Asset Store import failed: ${error?.message ?? error}`)
  })
})

export async function runImportFromStore (): Promise<void> {
  if (process.env.STORE_IMPORT_ENABLED === 'false') {
    logger.log('info', 'Godot Asset Store import is disabled (STORE_IMPORT_ENABLED=false)')
    return
  }

  if (importRunning) {
    logger.log('warn', 'Skipping Godot Asset Store import because the previous run is still active')
    return
  }

  importRunning = true
  try {
    await importFromStore()
  } finally {
    importRunning = false
  }
}

function listingFingerprint (asset: StoreAssetData): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      slug: asset.slug,
      publisherSlug: asset.publisher?.slug,
      name: asset.name,
      type: asset.type,
      description: asset.description,
      price_cent: asset.price_cent,
      license_type: asset.license_type,
      license_url: asset.license_url,
      thumbnail: asset.thumbnail,
      reviews_score: asset.reviews_score,
      store_url: asset.store_url,
      tags: (asset.tags ?? []).map(tag => tag.slug).sort((a, b) => (a ?? '').localeCompare(b ?? ''))
    }))
    .digest('hex')
}

function sourceAssetId (asset: StoreAssetData): string {
  return `${asset.publisher?.slug ?? ''}/${asset.slug ?? ''}`
}

/** Run one async fn per item with bounded concurrency (sequential by default). */
async function mapLimit<T, R> (items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const current = index
      index++
      results[current] = await fn(items[current])
    }
  })
  await Promise.all(workers)
  return results
}

async function fetchInventory (client: StoreApiClient): Promise<{ listings: StoreAssetData[], seenIDs: Set<string>, partialRun: boolean }> {
  const env = process.env.RUN_MODE ?? 'prod'
  const maxPages = env === 'devel' ? DEV_MAX_PAGES : Number.MAX_SAFE_INTEGER
  const listings: StoreAssetData[] = []
  const seenIDs = new Set<string>()
  let partialRun = false

  let page = 1
  while (page <= maxPages) {
    try {
      const result = await client.fetchAssetListings({
        page,
        pageSize: PAGE_SIZE,
        requireRelease: false
      })
      if (result.assets.length === 0) break
      for (const asset of result.assets) {
        if (asset.slug === undefined || asset.publisher?.slug === undefined) continue
        seenIDs.add(sourceAssetId(asset))
        listings.push(asset)
      }
      const nextPage = result.pagination?.next_page ?? null
      if (nextPage === null || nextPage <= page) break
      page = nextPage
    } catch (error: any) {
      logger.log('error', `[STORE IMPORTER] inventory page ${page} failed: ${error?.message ?? error}`)
      partialRun = true
      break
    }
  }

  logger.log('info', `[STORE IMPORTER] inventory complete: ${listings.length} listings, ${seenIDs.size} unique (partial=${partialRun})`)
  return { listings, seenIDs, partialRun }
}

interface StoreSyncState {
  inserted: number
  updated: number
  failed: number
  linked: number
  suggested: number
}

async function fetchDetailAndReleases (client: StoreApiClient, publisherSlug: string, assetSlug: string): Promise<{ detail: any, releases: any[] } | null> {
  try {
    const detail = await client.fetchAssetDetail(publisherSlug, assetSlug)
    const releases = await client.fetchAssetReleases(publisherSlug, assetSlug)
    return { detail, releases }
  } catch (error: any) {
    logger.log('error', `[STORE IMPORTER] detail/releases failed for ${publisherSlug}/${assetSlug}: ${error?.message ?? error}`)
    return null
  }
}

async function upsertStoreAsset (
  db: Db,
  normalized: NormalizedStoreAsset,
  fingerprint: string
): Promise<{ inserted: boolean, assetId: string }> {
  const assets = db.collection('assets')

  const existing = await assets.findOne(
    { provider: GODOT_STORE_PROVIDER, source_asset_id: normalized.source_asset_id },
    { projection: { asset_id: 1 } }
  )
  if (existing !== null) {
    await assets.updateOne(
      { provider: GODOT_STORE_PROVIDER, source_asset_id: normalized.source_asset_id },
      {
        $set: {
          ...normalized,
          store_listing_fingerprint: fingerprint,
          source_last_seen_at: new Date(),
          source_last_synced_at: new Date(),
          source_status: 'active',
          is_public: normalized.searchable === 'true'
        }
      }
    )
    return { inserted: false, assetId: existing.asset_id }
  }

  const assetId = nanoid()
  await assets.updateOne(
    { provider: GODOT_STORE_PROVIDER, source_asset_id: normalized.source_asset_id },
    {
      $set: {
        ...normalized,
        store_listing_fingerprint: fingerprint,
        source_last_seen_at: new Date(),
        source_last_synced_at: new Date(),
        source_status: 'active',
        source_missing_runs: 0,
        is_public: normalized.searchable === 'true'
      },
      $setOnInsert: {
        asset_id: assetId,
        group_id: assetId,
        group_preferred: true,
        is_group_root: true,
        link_status: 'none',
        added_date: new Date(),
        upvotes: 0,
        downvotes: 0,
        rating_score: 0,
        featured: false
      }
    },
    { upsert: true }
  )
  return { inserted: true, assetId }
}

async function maybeLinkToLegacy (db: Db, storeAssetId: string, normalized: NormalizedStoreAsset): Promise<'linked' | 'suggested' | 'none'> {
  if (normalized.normalized_repository === '') return 'none'

  const assets = db.collection('assets')
  const candidates = await assets.find(
    {
      provider: GODOT_ASSET_LIBRARY_PROVIDER,
      normalized_repository: normalized.normalized_repository,
      is_group_root: true
    },
    { projection: { asset_id: 1, title: 1, type: 1, normalized_repository: 1 } }
  ).toArray()

  const candidateDocs = candidates.map(candidate => ({
    asset_id: candidate.asset_id,
    title: candidate.title,
    normalized_repository: candidate.normalized_repository,
    type: candidate.type
  })) as LegacyLinkCandidate[]

  const decision = evaluateStoreLink(
    { normalized_repository: normalized.normalized_repository, title: normalized.title, source_type: normalized.source_type },
    candidateDocs
  )

  if (decision.action === 'link' && decision.candidate !== null) {
    await linkStoreToLegacy(
      db,
      storeAssetId,
      decision.candidate.asset_id,
      normalized.title,
      decision.candidate.title,
      normalized.normalized_repository,
      'store-importer'
    )
    return 'linked'
  }

  if (decision.action === 'suggest' && decision.candidate !== null) {
    await assets.updateOne(
      { asset_id: storeAssetId },
      {
        $set: {
          link_status: 'suggested',
          link_suggestion: {
            legacy_asset_id: decision.candidate.asset_id,
            normalized_repository: normalized.normalized_repository,
            legacy_title: decision.candidate.title,
            store_title: normalized.title,
            confidence: 0.5
          }
        }
      }
    )
    return 'suggested'
  }

  return 'none'
}

async function syncListings (db: Db, client: StoreApiClient, listings: StoreAssetData[]): Promise<StoreSyncState> {
  const state: StoreSyncState = { inserted: 0, updated: 0, failed: 0, linked: 0, suggested: 0 }
  const assets = db.collection('assets')

  const results = await mapLimit(listings, CONCURRENCY, async (listing) => {
    const fingerprint = listingFingerprint(listing)
    const existing = await assets.findOne(
      { provider: GODOT_STORE_PROVIDER, source_asset_id: sourceAssetId(listing) },
      { projection: { asset_id: 1, store_listing_fingerprint: 1, source_last_synced_at: 1 } }
    )
    const needsDetail = existing === null ||
      existing.store_listing_fingerprint !== fingerprint ||
      existing.source_last_synced_at == null ||
      (Date.now() - new Date(existing.source_last_synced_at).getTime()) > SWEEP_DAYS * 86_400_000

    if (!needsDetail) {
      // Still refresh last-seen so the record stays active.
      await assets.updateOne(
        { provider: GODOT_STORE_PROVIDER, source_asset_id: sourceAssetId(listing) },
        { $set: { source_last_seen_at: new Date() } }
      )
      return { kind: 'skip' as const }
    }

    const fetched = await fetchDetailAndReleases(client, listing.publisher?.slug ?? '', listing.slug ?? '')
    if (fetched === null) return { kind: 'failed' as const }

    const normalized = normalizeStoreAsset(fetched.detail, fetched.releases)
    if (normalized === null) {
      logger.log('warn', `[STORE IMPORTER] normalization failed for ${sourceAssetId(listing)}`)
      return { kind: 'failed' as const }
    }

    const { inserted, assetId } = await upsertStoreAsset(db, normalized, fingerprint)
    let linked = false
    let suggested = false
    if (inserted) {
      const outcome = await maybeLinkToLegacy(db, assetId, normalized)
      linked = outcome === 'linked'
      suggested = outcome === 'suggested'
    }
    return { kind: inserted ? 'insert' : 'update', linked, suggested }
  })

  for (const result of results) {
    if (result.kind === 'insert') {
      state.inserted++
      if (result.linked) state.linked++
      if (result.suggested) state.suggested++
    } else if (result.kind === 'update') {
      state.updated++
    } else if (result.kind === 'failed') {
      state.failed++
    }
  }

  return state
}

/** Provider-scoped tombstoning: only Store records are marked/unmarked. */
async function markStoreSourceStatus (db: Db, seenIDs: Set<string>, syncedAt: Date): Promise<void> {
  const assets = db.collection('assets')
  const seen = Array.from(seenIDs)

  await assets.updateMany(
    { provider: GODOT_STORE_PROVIDER, source_asset_id: { $in: seen } },
    {
      $set: { source_status: 'active', source_last_seen_at: syncedAt, source_last_synced_at: syncedAt },
      $unset: { source_missing_runs: '' }
    }
  )

  await assets.updateMany(
    { provider: GODOT_STORE_PROVIDER, source_asset_id: { $in: seen }, searchable: { $ne: 'false' } },
    { $set: { is_public: true } }
  )
  await assets.updateMany(
    { provider: GODOT_STORE_PROVIDER, source_asset_id: { $in: seen }, searchable: 'false' },
    { $set: { is_public: false } }
  )

  await assets.updateMany(
    { provider: GODOT_STORE_PROVIDER, source_asset_id: { $nin: seen }, source_status: { $ne: 'unavailable' } },
    { $inc: { source_missing_runs: 1 } }
  )

  await assets.updateMany(
    { provider: GODOT_STORE_PROVIDER, source_asset_id: { $nin: seen }, source_missing_runs: { $gte: 3 } },
    { $set: { source_status: 'unavailable', is_public: false } }
  )
}

async function importFromStore (): Promise<void> {
  logger.log('info', 'Fetching data to mirror from the Godot Asset Store')
  const db: Db = MongoHelper.getDatabase()
  const client = createStoreApiClient()

  const { listings, seenIDs, partialRun } = await fetchInventory(client)
  const state = await syncListings(db, client, listings)

  if (partialRun) {
    logger.log('warn', '[STORE IMPORTER] inventory was partial; skipping source-status marking')
  } else {
    await markStoreSourceStatus(db, seenIDs, new Date())
  }

  logger.log('info',
    `[STORE IMPORTER] done: ${state.inserted} inserted, ${state.updated} updated, ${state.failed} failed, ` +
    `${state.linked} auto-linked, ${state.suggested} suggested for review`)
}
