import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'

/**
 * Backfill the denormalized `is_public` flag from the legacy public-catalog
 * predicate (`source_status !== 'unavailable' && searchable !== 'false'`) so
 * every discovery query can use a single indexed equality (`is_public: true`)
 * instead of negative `$ne` predicates that defeat index selectivity.
 *
 * Only documents missing the field are touched, so the migration is idempotent
 * and cheap to re-run. The importer (`normalizeAssetForSync` +
 * `markSourceStatus`) keeps the flag current for new/updated assets afterwards.
 */
export async function backfillIsPublic (db: Db): Promise<void> {
  const assets = db.collection('assets')

  // Tombstoned upstream or explicitly non-searchable -> not public.
  const hidden = await assets.updateMany(
    {
      is_public: { $exists: false },
      $or: [{ source_status: 'unavailable' }, { searchable: 'false' }]
    },
    { $set: { is_public: false } }
  )

  // Everything else (including documents missing source_status/searchable,
  // which the legacy `$ne` semantics treated as public) -> public.
  const shown = await assets.updateMany(
    {
      is_public: { $exists: false },
      source_status: { $ne: 'unavailable' },
      searchable: { $ne: 'false' }
    },
    { $set: { is_public: true } }
  )

  logger.log('info', `Backfilled is_public: ${shown.modifiedCount ?? 0} public, ${hidden.modifiedCount ?? 0} hidden`)
}
