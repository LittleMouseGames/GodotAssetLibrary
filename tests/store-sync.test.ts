import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildStoreUpsertPayload, StoreUpsertPayload } from '../src/app/utilities/fetchFromGodotStore/jobs/fetchFromGodotStore'
import { NormalizedStoreAsset } from '../src/app/utilities/fetchFromGodotStore/services/normalizeStoreAsset'
import {
  linkStoreToLegacy,
  rejectStoreLinkSuggestion,
  setPreferredVariant,
  unlinkStoreFromLegacy
} from '../src/app/utilities/fetchFromGodotStore/services/linkStoreToLegacy'
import { GODOT_STORE_PROVIDER, GODOT_ASSET_LIBRARY_PROVIDER } from '../src/core/utils/assetProvider'

type Doc = Record<string, any>

function matchesQuery (doc: Doc, query: Record<string, any>): boolean {
  return Object.entries(query).every(([key, value]) => {
    if (value !== null && typeof value === 'object' && '$ne' in value) {
      return doc[key] !== value.$ne
    }
    return doc[key] === value
  })
}

function applyUpdate (doc: Doc, update: Record<string, any>): void {
  if (update.$set !== undefined) Object.assign(doc, update.$set)
  if (update.$unset !== undefined) {
    for (const key of Object.keys(update.$unset)) Reflect.deleteProperty(doc, key)
  }
  if (update.$inc !== undefined) {
    for (const [key, amount] of Object.entries(update.$inc as Record<string, number>)) {
      doc[key] = Number(doc[key] ?? 0) + amount
    }
  }
}

function makeFakeDb (initial: Doc[]): { db: any, docs: Doc[] } {
  const docs: Doc[] = initial.map(doc => ({ ...doc }))
  const assets = {
    findOne: async (query: Record<string, any>): Promise<Doc | null> => {
      const found = docs.find(doc => matchesQuery(doc, query))
      return found !== undefined ? found : null
    },
    updateOne: async (query: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number, modifiedCount: number }> => {
      const index = docs.findIndex(doc => matchesQuery(doc, query))
      if (index === -1) return { matchedCount: 0, modifiedCount: 0 }
      applyUpdate(docs[index], update)
      return { matchedCount: 1, modifiedCount: 1 }
    },
    updateMany: async (query: Record<string, any>, update: Record<string, any>): Promise<{ modifiedCount: number }> => {
      let count = 0
      for (const doc of docs) {
        if (matchesQuery(doc, query)) {
          applyUpdate(doc, update)
          count++
        }
      }
      return { modifiedCount: count }
    },
    countDocuments: async (query: Record<string, any>): Promise<number> => {
      return docs.filter(doc => matchesQuery(doc, query)).length
    }
  }
  const db = { collection: (name: string): unknown => (name === 'assets' ? assets : {}) }
  return { db, docs }
}

function legacyDoc (assetId: string, overrides: Doc = {}): Doc {
  return {
    asset_id: assetId,
    group_id: assetId,
    group_preferred: true,
    is_group_root: true,
    provider: GODOT_ASSET_LIBRARY_PROVIDER,
    source_asset_id: `legacy-${assetId}`,
    title: 'Legacy Project',
    ...overrides
  }
}

function storeDoc (assetId: string, overrides: Doc = {}): Doc {
  return {
    asset_id: assetId,
    group_id: assetId,
    group_preferred: true,
    is_group_root: true,
    provider: GODOT_STORE_PROVIDER,
    source_asset_id: `pub/${assetId}`,
    title: 'Store Project',
    ...overrides
  }
}

function minimalNormalized (overrides: Doc = {}): NormalizedStoreAsset {
  return {
    provider: 'godot_store',
    source_asset_id: 'pub/asset',
    source_publisher_slug: 'pub',
    source_asset_slug: 'asset',
    title: 'Asset',
    author: 'Author',
    author_lowercase: 'author',
    author_id: 'pub',
    source_type: 0,
    type: 'Addon',
    category: 'Tools',
    category_lowercase: 'tools',
    description: '',
    quick_description: '',
    godot_version: '4.2',
    godot_major: 4,
    godot_majors: [4],
    compatibility_label: 'Godot 4.2+',
    compatibility_ranges: [],
    version_string: 'v1',
    price_cent: 0,
    price_currency: 'EUR',
    is_free: true,
    cost: '0',
    license_type: 'MIT',
    license_url: '',
    source_rating: null,
    source_featured: false,
    store_url: 'https://store.godotengine.org/asset/pub/asset/',
    donation_url: '',
    donation_text: '',
    browse_url: '',
    normalized_repository: '',
    icon_url: '',
    card_banner: '',
    previews: [],
    body: { source_format: 'bbcode', source_bbcode: '', sanitized_html: '' },
    releases: [],
    added_date: new Date('2025-01-01T00:00:00Z'),
    modify_date: '',
    modify_date_at: new Date('2025-01-01T00:00:00Z'),
    searchable: 'true',
    publisher: { slug: 'pub', name: 'Author', thumbnail_url: '', store_url: '', verified: false },
    tags: [],
    tag_slugs: [],
    tag_names: [],
    ...overrides
  }
}

describe('buildStoreUpsertPayload', () => {
  it('never puts the same path in both $set and $setOnInsert (added_date regression)', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const payload: StoreUpsertPayload = buildStoreUpsertPayload(minimalNormalized(), 'fp', 'abc123', now)

    const overlap = Object.keys(payload.set).filter(key => key in payload.setOnInsert)
    assert.deepEqual(overlap, [])
    // added_date is insert-only (MongoDB rejects it in both).
    assert.equal('added_date' in payload.set, false)
    assert.equal(payload.setOnInsert.added_date, now)
  })

  it('keeps insert-only identity fields in $setOnInsert and derived state in $set', () => {
    const payload: StoreUpsertPayload = buildStoreUpsertPayload(minimalNormalized(), 'fp', 'abc123')

    for (const key of ['asset_id', 'group_id', 'group_preferred', 'is_group_root', 'link_status', 'added_date', 'upvotes', 'downvotes', 'rating_score', 'featured']) {
      assert.ok(key in payload.setOnInsert, `expected ${key} in $setOnInsert`)
    }
    assert.equal(payload.set.is_public, true)
    assert.equal(payload.set.store_listing_fingerprint, 'fp')
    assert.equal(payload.set.source_status, 'active')
    assert.equal(payload.set.searchable, 'true')
  })

  it('derives is_public from searchable in $set', () => {
    const nonPublic: StoreUpsertPayload = buildStoreUpsertPayload(minimalNormalized({ searchable: 'false' }), 'fp', 'abc123')
    assert.equal(nonPublic.set.is_public, false)
  })
})

describe('linkStoreToLegacy', () => {
  it('links a Store record to a legacy root (store-first) and updates link state', async () => {
    const legacy = legacyDoc('legacy1')
    const store = storeDoc('store1')
    const { db, docs } = makeFakeDb([legacy, store])

    await linkStoreToLegacy(db, 'store1', 'legacy1', 'Store Project', 'Legacy Project', 'github.com/a/b', 'importer')

    const storeAfter = docs.find(d => d.asset_id === 'store1')
    const legacyAfter = docs.find(d => d.asset_id === 'legacy1')
    assert.ok(storeAfter !== undefined)
    assert.ok(legacyAfter !== undefined)
    assert.equal(storeAfter.group_id, 'legacy1')
    assert.equal(storeAfter.group_preferred, true)
    assert.equal(storeAfter.is_group_root, false)
    assert.equal(storeAfter.link_status, 'linked')
    assert.equal(storeAfter.link_info.method, 'repository+title')
    assert.equal(storeAfter.link_info.evidence.normalized_repository, 'github.com/a/b')
    // Store-first default: the legacy root stops being the preferred variant.
    assert.equal(legacyAfter.group_preferred, false)
  })

  it('rejects linking a Store record that already belongs to a group', async () => {
    const store = storeDoc('store1', { group_id: 'other' })
    const { db } = makeFakeDb([legacyDoc('legacy1'), store])
    await assert.rejects(
      async () => { await linkStoreToLegacy(db, 'store1', 'legacy1', 'S', 'L', 'github.com/a/b', 'importer') },
      /already linked/
    )
  })

  it('rejects linking to a legacy record that is not a group root', async () => {
    const legacy = legacyDoc('legacy1', { is_group_root: false, group_id: 'root' })
    const { db } = makeFakeDb([legacy, storeDoc('store1')])
    await assert.rejects(
      async () => { await linkStoreToLegacy(db, 'store1', 'legacy1', 'S', 'L', 'github.com/a/b', 'importer') },
      /not a group root/
    )
  })

  it('rejects linking when the legacy root already has another Store variant', async () => {
    const legacy = legacyDoc('legacy1', { group_preferred: false })
    const { db } = makeFakeDb([
      legacy,
      storeDoc('store1'),
      storeDoc('existing-variant', { group_id: 'legacy1', is_group_root: false, group_preferred: true })
    ])
    await assert.rejects(
      async () => { await linkStoreToLegacy(db, 'store1', 'legacy1', 'S', 'L', 'github.com/a/b', 'importer') },
      /already has a linked Store variant/
    )
  })
})

describe('unlinkStoreFromLegacy', () => {
  it('makes the Store record its own root and restores the legacy root as preferred', async () => {
    const legacy = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false, link_status: 'linked' })
    const { db, docs } = makeFakeDb([legacy, store])

    await unlinkStoreFromLegacy(db, 'store1')

    const storeAfter = docs.find(d => d.asset_id === 'store1')
    const legacyAfter = docs.find(d => d.asset_id === 'legacy1')
    assert.ok(storeAfter !== undefined)
    assert.ok(legacyAfter !== undefined)
    assert.equal(storeAfter.group_id, 'store1')
    assert.equal(storeAfter.is_group_root, true)
    assert.equal(storeAfter.group_preferred, true)
    assert.equal(storeAfter.link_status, 'none')
    assert.equal(storeAfter.link_info, undefined)
    assert.equal(legacyAfter.group_preferred, true)
  })
})

describe('setPreferredVariant', () => {
  it('marks exactly one provider variant in the group as preferred', async () => {
    const legacy = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const { db, docs } = makeFakeDb([legacy, store])

    await setPreferredVariant(db, 'legacy1', GODOT_ASSET_LIBRARY_PROVIDER)

    const legacyAfter = docs.find(d => d.asset_id === 'legacy1')
    const storeAfter = docs.find(d => d.asset_id === 'store1')
    assert.ok(legacyAfter !== undefined)
    assert.ok(storeAfter !== undefined)
    assert.equal(legacyAfter.group_preferred, true)
    assert.equal(storeAfter.group_preferred, false)
  })

  it('throws when the group has no variant for the requested provider', async () => {
    const { db } = makeFakeDb([legacyDoc('legacy1')])
    await assert.rejects(
      async () => { await setPreferredVariant(db, 'legacy1', GODOT_STORE_PROVIDER) },
      /No godot_store variant found/
    )
  })

  it('does not clear the current preferred flag when the requested provider is missing', async () => {
    const legacy = legacyDoc('legacy1', { group_preferred: true })
    const { db, docs } = makeFakeDb([legacy])
    await assert.rejects(
      async () => { await setPreferredVariant(db, 'legacy1', GODOT_STORE_PROVIDER) },
      /No godot_store variant found/
    )
    // The failed request must leave the existing preferred variant intact
    // (the group must never be left with NO preferred variant).
    const legacyAfter = docs.find(d => d.asset_id === 'legacy1')
    assert.ok(legacyAfter !== undefined)
    assert.equal(legacyAfter.group_preferred, true)
  })
})

describe('rejectStoreLinkSuggestion', () => {
  it('marks the Store record rejected and clears the suggestion', async () => {
    const store = storeDoc('store1', {
      link_status: 'suggested',
      link_suggestion: { legacy_asset_id: 'legacy1', normalized_repository: 'github.com/a/b', legacy_title: 'L', store_title: 'S', confidence: 0.5 }
    })
    const { db, docs } = makeFakeDb([store])

    await rejectStoreLinkSuggestion(db, 'store1')

    const storeAfter = docs.find(d => d.asset_id === 'store1')
    assert.ok(storeAfter !== undefined)
    assert.equal(storeAfter.link_status, 'rejected')
    assert.equal(storeAfter.link_suggestion, undefined)
  })
})
