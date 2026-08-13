import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'
import { GODOT_ASSET_LIBRARY_PROVIDER } from 'core/utils/assetProvider'
import { normalizeRepositoryUrl } from 'core/utils/repositoryNormalization'

/**
 * Backfill the provider-qualified identity fields on existing (legacy) asset
 * documents so a second source (the Godot Asset Store) can be added safely:
 *
 * - `provider: 'godot_asset_library'`
 * - `source_asset_id: <legacy_asset_id>` (provider-scoped identity)
 * - `group_id: <asset_id>` (existing legacy records are the root/canonical of
 *   their own project group)
 * - `group_preferred: true` (only variant in the group)
 * - `is_group_root: true`
 * - `godot_majors: [godot_major]` (so major-line discovery can use the shared
 *   array field once Store records bring ranges)
 *
 * The unique `{ provider, source_asset_id }` index is created AFTER an
 * idempotent duplicate audit: if duplicate source identities already exist the
 * migration fails loudly (and is retried next run) instead of silently
 * corrupting the uniqueness contract.
 */
export async function backfillProviderIdentity (db: Db): Promise<void> {
  const assets = db.collection('assets')

  // Only touch documents that have not been source-qualified yet, so the
  // migration is idempotent and never clobbers Store records or a later
  // admin-managed link state.
  const result = await assets.updateMany(
    { provider: { $exists: false } },
    [
      {
        $set: {
          provider: GODOT_ASSET_LIBRARY_PROVIDER,
          source_asset_id: '$legacy_asset_id',
          group_id: '$asset_id',
          group_preferred: true,
          is_group_root: true,
          godot_majors: {
            $cond: {
              if: { $isNumber: '$godot_major' },
              then: ['$godot_major'],
              else: []
            }
          }
        }
      }
    ]
  )
  logger.log('info', `Backfilled provider identity on ${result.modifiedCount ?? 0} legacy asset(s)`)

  // Backfill normalized_repository so strict duplicate linking can query it.
  // Normalization is pure JS (Mongo cannot normalize URLs in a pipeline), and
  // the catalog is small enough to iterate once.
  const legacyDocs = await assets.find(
    { provider: GODOT_ASSET_LIBRARY_PROVIDER, normalized_repository: { $exists: false } },
    { projection: { _id: 1, browse_url: 1 } }
  ).toArray()
  let repoCount = 0
  for (const doc of legacyDocs) {
    const normalized = normalizeRepositoryUrl(doc.browse_url)
    if (normalized === null) continue
    await assets.updateOne({ _id: doc._id }, { $set: { normalized_repository: normalized } })
    repoCount++
  }
  logger.log('info', `Backfilled normalized_repository on ${repoCount} legacy asset(s)`)

  // Duplicate audit for (provider, source_asset_id): group by the pair and
  // find any group with more than one document.
  const duplicates = await assets.aggregate([
    { $group: { _id: { provider: '$provider', source_asset_id: '$source_asset_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 }
  ]).toArray()

  if (duplicates.length > 0) {
    const samples = duplicates.map(d => `${String(d._id.provider)}:${String(d._id.source_asset_id)}`).join(', ')
    throw new Error(`Duplicate (provider, source_asset_id) groups found (${duplicates.length}) — resolve before creating the unique index: ${samples}`)
  }

  // Create the unique source identity index. Creating it here (not only in
  // ensureIndexes) makes it a controlled, audited step that runs once.
  await assets.createIndex(
    { provider: 1, source_asset_id: 1 },
    { unique: true, name: 'assets_provider_source_asset_id_unique' }
  )
  logger.log('info', 'Created unique (provider, source_asset_id) index')
}
