/**
 * Strict cross-source linking between a Godot Asset Store record and an
 * existing legacy Asset Library record that represent the SAME project.
 *
 * Policy (user decision): group linked variants into one canonical project,
 * defaulting to the Store variant for presentation. Auto-link ONLY on
 * high-confidence evidence — a unique normalized Git repository plus a strict
 * normalized-title match and a compatible type family. Anything else becomes
 * an admin review suggestion (`link_status: 'suggested'`).
 *
 * Grouping uses a single `assets` collection with one document per source
 * listing:
 * - the project's canonical URL/identity lives on the GROUP ROOT (the record
 *   whose `group_id === asset_id`),
 * - exactly ONE record per group is `group_preferred` (shown in unified
 *   discovery),
 * - store-first is the default preference for linked projects.
 */

import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'
import { GODOT_ASSET_LIBRARY_PROVIDER, GODOT_STORE_PROVIDER } from 'core/utils/assetProvider'
import { normalizeProjectTitle } from 'core/utils/repositoryNormalization'

export type StoreLinkDecision = 'link' | 'suggest' | 'none'

export interface LegacyLinkCandidate {
  asset_id: string
  title: string
  normalized_repository: string
  /** Legacy app `type` value (e.g. "Tool", "Project", "Template"). */
  type?: string
}

export interface StoreLinkInput {
  normalized_repository?: string
  title: string
  source_type?: number
}

export interface StoreLinkDecisionResult {
  action: StoreLinkDecision
  candidate: LegacyLinkCandidate | null
}

function typeFamilyMatches (storeType: number | undefined, legacyType: string | undefined): boolean {
  const legacy = String(legacyType ?? '').toLocaleLowerCase()
  if (storeType === 1) {
    // Full projects only match project-like legacy types.
    return /project|template|demo/.test(legacy)
  }
  // Addons may have been classified under any legacy non-project type.
  return legacy === '' || !/project|template|demo/.test(legacy)
}

/**
 * Decide whether a Store record should be auto-linked to a legacy candidate
 * group, suggested for admin review, or left alone.
 *
 * - exactly one active legacy candidate with the same normalized repository
 *   AND a strict normalized-title match AND a compatible type family -> link
 * - exactly one candidate with only a repository match -> suggest (title drift)
 * - multiple candidates -> suggest (ambiguous; first candidate flagged)
 * - no candidate / no repository -> none
 */
export function evaluateStoreLink (store: StoreLinkInput, candidates: LegacyLinkCandidate[]): StoreLinkDecisionResult {
  if (store.normalized_repository === undefined || store.normalized_repository === '') {
    return { action: 'none', candidate: null }
  }

  const repoCandidates = candidates.filter(candidate =>
    candidate.normalized_repository === store.normalized_repository
  )
  if (repoCandidates.length === 0) {
    return { action: 'none', candidate: null }
  }

  // Prefer candidates that also match the type family.
  const compatible = repoCandidates.filter(candidate => typeFamilyMatches(store.source_type, candidate.type))
  const pool = compatible.length > 0 ? compatible : repoCandidates

  const storeTitle = normalizeProjectTitle(store.title)
  const exactTitle = pool.filter(candidate => normalizeProjectTitle(candidate.title) === storeTitle)

  if (pool.length === 1 && exactTitle.length === 1) {
    return { action: 'link', candidate: pool[0] }
  }

  if (exactTitle.length === 1) {
    return { action: 'suggest', candidate: exactTitle[0] }
  }

  return { action: 'suggest', candidate: pool[0] ?? null }
}

/**
 * Link a Store record to a legacy project. The Store variant becomes the
 * group's preferred (store-first) presentation variant; the legacy record
 * remains the group ROOT (its `asset_id` keeps the canonical URL and any
 * existing reviews/saves/featured state).
 */
export async function linkStoreToLegacy (
  db: Db,
  storeAssetId: string,
  legacyAssetId: string,
  storeTitle: string,
  legacyTitle: string,
  normalizedRepository: string,
  linkedBy: string
): Promise<void> {
  const assets = db.collection('assets')

  // Guard: the legacy record must still be a group root with no linked Store
  // variant already, and the Store record must not already belong to a group.
  const [storeDoc, legacyDoc] = await Promise.all([
    assets.findOne({ asset_id: storeAssetId, provider: GODOT_STORE_PROVIDER }, { projection: { group_id: 1 } }),
    assets.findOne({ asset_id: legacyAssetId, provider: GODOT_ASSET_LIBRARY_PROVIDER }, { projection: { group_id: 1, is_group_root: 1 } })
  ])
  if (storeDoc == null || legacyDoc == null) {
    throw new Error(`Cannot link: store asset ${storeAssetId} or legacy asset ${legacyAssetId} not found`)
  }
  if (storeDoc.group_id != null && storeDoc.group_id !== storeAssetId) {
    throw new Error(`Store asset ${storeAssetId} is already linked to group ${storeDoc.group_id}`)
  }
  if (legacyDoc.is_group_root !== true) {
    throw new Error(`Legacy asset ${legacyAssetId} is not a group root; cannot link`)
  }
  const existingVariant = await assets.findOne({
    provider: GODOT_STORE_PROVIDER,
    group_id: legacyAssetId,
    asset_id: { $ne: storeAssetId }
  }, { projection: { _id: 1 } })
  if (existingVariant != null) {
    throw new Error(`Legacy asset ${legacyAssetId} already has a linked Store variant`)
  }

  await assets.updateOne(
    { asset_id: storeAssetId },
    {
      $set: {
        group_id: legacyAssetId,
        group_preferred: true,
        is_group_root: false,
        link_status: 'linked',
        link_info: {
          method: 'repository+title',
          confidence: 1,
          linked_at: new Date(),
          linked_by: linkedBy,
          evidence: {
            normalized_repository: normalizedRepository,
            legacy_title: legacyTitle,
            store_title: storeTitle
          }
        }
      },
      $unset: { link_suggestion: '' }
    }
  )

  // Store-first default: the legacy record stops being the preferred variant
  // (its identity/URL stays; the PDP defaults to the Store variant content).
  await assets.updateOne(
    { asset_id: legacyAssetId },
    { $set: { group_preferred: false } }
  )
  logger.log('info', `Linked Store asset ${storeAssetId} to legacy project ${legacyAssetId}`)
}

/**
 * Remove a Store record from its group, making it its own project again. If it
 * was the only Store variant, the legacy root becomes preferred again.
 */
export async function unlinkStoreFromLegacy (db: Db, storeAssetId: string): Promise<void> {
  const assets = db.collection('assets')
  const storeDoc = await assets.findOne({ asset_id: storeAssetId, provider: GODOT_STORE_PROVIDER })
  if (storeDoc == null) throw new Error(`Store asset ${storeAssetId} not found`)

  const previousGroupId = storeDoc.group_id ?? storeAssetId
  await assets.updateOne(
    { asset_id: storeAssetId },
    {
      $set: {
        group_id: storeAssetId,
        group_preferred: true,
        is_group_root: true,
        link_status: 'none'
      },
      $unset: { link_info: '', link_suggestion: '' }
    }
  )

  // If no Store variant remains in the previous group, the legacy root resumes
  // being the preferred variant.
  const remaining = await assets.countDocuments({
    provider: GODOT_STORE_PROVIDER,
    group_id: previousGroupId,
    asset_id: { $ne: storeAssetId }
  })
  if (remaining === 0) {
    await assets.updateOne(
      { asset_id: previousGroupId, provider: GODOT_ASSET_LIBRARY_PROVIDER },
      { $set: { group_preferred: true } }
    )
  }
  logger.log('info', `Unlinked Store asset ${storeAssetId}`)
}

/** Set which provider's variant in a group is the discovery-preferred one. */
export async function setPreferredVariant (db: Db, groupId: string, provider: string): Promise<void> {
  const assets = db.collection('assets')
  await assets.updateMany(
    { group_id: groupId },
    { $set: { group_preferred: false } }
  )
  const result = await assets.updateOne(
    { group_id: groupId, provider },
    { $set: { group_preferred: true } }
  )
  if (result.matchedCount === 0) {
    throw new Error(`No ${provider} variant found in group ${groupId}`)
  }
  logger.log('info', `Preferred variant for group ${groupId} set to ${provider}`)
}

/** Admin: dismiss a suggested link so the importer stops proposing it. */
export async function rejectStoreLinkSuggestion (db: Db, storeAssetId: string): Promise<void> {
  await db.collection('assets').updateOne(
    { asset_id: storeAssetId, provider: GODOT_STORE_PROVIDER },
    { $set: { link_status: 'rejected' }, $unset: { link_suggestion: '' } }
  )
  logger.log('info', `Rejected link suggestion for Store asset ${storeAssetId}`)
}
