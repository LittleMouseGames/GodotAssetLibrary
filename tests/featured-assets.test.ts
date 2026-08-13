import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  HERO_MAX_SLIDES,
  resolveCuratedProjects,
  resolveFeaturedAdminRows
} from '../src/core/utils/homepageHero'

type Doc = Record<string, any>

function legacyDoc (id: string, overrides: Doc = {}): Doc {
  return {
    asset_id: id,
    group_id: id,
    group_preferred: true,
    is_group_root: true,
    is_public: true,
    provider: 'godot_asset_library',
    title: `Legacy ${id}`,
    author: 'Author',
    quick_description: 'A legacy asset',
    category: 'Tools',
    category_lowercase: 'tools',
    godot_version: '3.5',
    godot_major: 3,
    card_banner: 'https://example.com/banner.png',
    icon_url: 'https://example.com/icon.png',
    previews: [],
    ...overrides
  }
}

function storeDoc (id: string, overrides: Doc = {}): Doc {
  return {
    asset_id: id,
    group_id: id,
    group_preferred: true,
    is_group_root: true,
    is_public: true,
    provider: 'godot_store',
    title: `Store ${id}`,
    author: 'Publisher',
    quick_description: 'A store asset',
    category: 'Tools',
    category_lowercase: 'tools',
    godot_version: '4.2',
    godot_major: 4,
    card_banner: 'https://example.com/store-banner.png',
    icon_url: 'https://example.com/store-icon.png',
    previews: [],
    ...overrides
  }
}

/**
 * The pure canonicalization used by AdminService.updateFeaturedOrder: takes the
 * submitted DOM order and returns the canonical group list that gets persisted
 * via UpdateFeaturedAssetsOrder, or throws on unknown ids.
 */
function buildOrderPayload (submittedIds: string[], assets: Doc[]): { orderedIds: string[], missingIds: string[] } {
  if (submittedIds.length > HERO_MAX_SLIDES) {
    throw new Error(`Homepage hero supports at most ${HERO_MAX_SLIDES} projects`)
  }
  const { refs, missingIds } = resolveCuratedProjects(submittedIds, assets)
  return { orderedIds: refs.map(ref => ref.groupId), missingIds }
}

describe('featured order-save canonicalization', () => {
  it('replaces a linked Store sibling with its canonical legacy root', () => {
    const root = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const { orderedIds, missingIds } = buildOrderPayload(['store1'], [root, store])
    assert.deepEqual(orderedIds, ['legacy1'])
    assert.deepEqual(missingIds, [])
  })

  it('preserves curator order and deduplicates to first occurrence', () => {
    const a = legacyDoc('a')
    const b = legacyDoc('b')
    const bStore = storeDoc('store-b', { group_id: 'b', group_preferred: true, is_group_root: false })
    const { orderedIds, missingIds } = buildOrderPayload(['b', 'a', 'store-b', 'a'], [a, b, bStore])
    assert.deepEqual(orderedIds, ['b', 'a'])
    assert.deepEqual(missingIds, [])
  })

  it('reports unknown ids instead of silently dropping them', () => {
    const a = legacyDoc('a')
    const { orderedIds, missingIds } = buildOrderPayload(['a', 'unknown', '  '], [a])
    assert.deepEqual(orderedIds, ['a'])
    assert.deepEqual(missingIds, ['unknown'])
  })

  it('enforces the hero maximum', () => {
    const ids = Array.from({ length: HERO_MAX_SLIDES + 1 }, (_, i) => `p${i}`)
    const assets = ids.map(id => legacyDoc(id))
    assert.throws(() => buildOrderPayload(ids, assets), /at most 8/)
  })

  it('allows an empty submission (clears the hero)', () => {
    const { orderedIds, missingIds } = buildOrderPayload([], [])
    assert.deepEqual(orderedIds, [])
    assert.deepEqual(missingIds, [])
  })
})

describe('featured admin rows', () => {
  it('shows the preferred display variant for each project', () => {
    const root = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const rows = resolveFeaturedAdminRows(['legacy1'], [root, store])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].groupId, 'legacy1')
    assert.equal(rows[0].provider, 'godot_store')
    assert.equal(rows[0].isPublic, true)
    assert.equal(rows[0].isMissing, false)
  })

  it('surfaces missing projects so the curator can remove them', () => {
    const rows = resolveFeaturedAdminRows(['gone'], [])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].isMissing, true)
    assert.equal(rows[0].title, 'Missing project')
  })

  it('deduplicates configured sibling + root ids into one row', () => {
    const root = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const rows = resolveFeaturedAdminRows(['legacy1', 'store1'], [root, store])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].groupId, 'legacy1')
  })
})
