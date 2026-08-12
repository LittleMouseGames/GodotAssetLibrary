import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'
import { parseGodotMajor } from 'core/utils/godotVersionPreference'

/**
 * Backfill the normalized numeric `godot_major` field from the exact
 * `godot_version` string (e.g. "4.2" -> 4, "3.5" -> 3).
 *
 * Major-line browsing ("4.x", "3.x", "2.x", "All") filters on this field with
 * an indexed equality match. Records whose `godot_version` cannot be parsed
 * are left unclassified (no `godot_major`), so they only appear under "All"
 * rather than being misattributed to a major line.
 *
 * The migration is idempotent: it only touches documents without the field and
 * uses a bounded cursor so it never holds the whole collection in memory.
 */
export async function backfillGodotMajor (db: Db): Promise<void> {
  const assets = db.collection('assets')

  const cursor = assets.find(
    { godot_major: { $exists: false } },
    { projection: { _id: 1, godot_version: 1 }, batchSize: 500 }
  )

  let updated = 0
  let skipped = 0

  for await (const asset of cursor) {
    const major = parseGodotMajor(asset.godot_version)
    if (major === undefined) {
      skipped++
      continue
    }

    const result = await assets.updateOne(
      { _id: asset._id },
      { $set: { godot_major: major } }
    )
    if (result.modifiedCount > 0) updated++
  }

  logger.log('info', `Backfilled godot_major for ${updated} assets (${skipped} skipped/unparseable)`)
}
