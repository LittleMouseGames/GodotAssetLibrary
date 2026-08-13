import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { backfillProviderIdentity } from '../src/core/migrations/0007-provider-identity'

interface UpdateCall {
  filter: Record<string, unknown>
  pipeline: Array<Record<string, unknown>> | undefined
}

function makeFakeDb (options: { duplicates?: unknown[], legacyDocs?: Array<{ _id: string, browse_url: string }> } = {}): {
  db: any
  calls: UpdateCall[]
  createdIndexes: Array<{ key: Record<string, unknown>, options: Record<string, unknown> }>
} {
  const calls: UpdateCall[] = []
  const createdIndexes: Array<{ key: Record<string, unknown>, options: Record<string, unknown> }> = []
  const assets = {
    updateMany: async (filter: Record<string, unknown>, update: Record<string, unknown> | Array<Record<string, unknown>>): Promise<{ modifiedCount: number }> => {
      calls.push({ filter, pipeline: Array.isArray(update) ? update : undefined })
      return { modifiedCount: 1 }
    },
    find: (_filter: Record<string, unknown>, _projection: Record<string, unknown>): { toArray: () => Promise<unknown[]> } => ({
      toArray: async () => (options.legacyDocs ?? [])
    }),
    updateOne: async (): Promise<{ modifiedCount: number }> => ({ modifiedCount: 1 }),
    aggregate: (): { toArray: () => Promise<unknown[]> } => ({
      toArray: async () => (options.duplicates ?? [])
    }),
    createIndex: async (key: Record<string, unknown>, indexOptions: Record<string, unknown>): Promise<string> => {
      createdIndexes.push({ key, options: indexOptions })
      return 'ok'
    }
  }
  const db = { collection: (name: string): unknown => (name === 'assets' ? assets : {}) }
  return { db, calls, createdIndexes }
}

describe('backfillProviderIdentity', () => {
  it('backfills provider identity on legacy docs via an aggregation pipeline', async () => {
    const { db, calls } = makeFakeDb()
    await backfillProviderIdentity(db)

    const identityCall = calls.find(call => call.pipeline !== undefined)
    assert.ok(identityCall !== undefined)
    assert.deepEqual(identityCall.filter, { provider: { $exists: false } })

    const setStage = (identityCall?.pipeline ?? []).find(stage => stage.$set !== undefined)
    assert.ok(setStage !== undefined)
    const set = setStage.$set as Record<string, unknown>
    assert.equal(set.provider, 'godot_asset_library')
    assert.equal(set.source_asset_id, '$legacy_asset_id')
    assert.equal(set.group_id, '$asset_id')
    assert.equal(set.group_preferred, true)
    assert.equal(set.is_group_root, true)
  })

  it('creates the unique source identity index after a clean duplicate audit', async () => {
    const { db, createdIndexes } = makeFakeDb({ legacyDocs: [{ _id: '1', browse_url: 'https://github.com/owner/repo' }] })
    await backfillProviderIdentity(db)
    assert.equal(createdIndexes.length, 1)
    assert.deepEqual(createdIndexes[0].key, { provider: 1, source_asset_id: 1 })
    assert.equal(createdIndexes[0].options.unique, true)
  })

  it('throws loudly when duplicate source identities exist', async () => {
    const { db } = makeFakeDb({
      duplicates: [{ _id: { provider: 'godot_asset_library', source_asset_id: 'dup' }, count: 2 }]
    })
    await assert.rejects(async () => { await backfillProviderIdentity(db) }, /Duplicate \(provider, source_asset_id\)/)
  })
})
