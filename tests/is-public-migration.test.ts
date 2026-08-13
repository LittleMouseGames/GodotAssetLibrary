import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { backfillIsPublic } from '../src/core/migrations/0006-backfill-is-public'

interface UpdateCall {
  filter: Record<string, unknown>
  update: Record<string, unknown>
}

function makeFakeDb (): { db: any, calls: UpdateCall[] } {
  const calls: UpdateCall[] = []
  const assets = {
    updateMany: async (filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }> => {
      calls.push({ filter, update })
      return { modifiedCount: 1 }
    }
  }
  const db = { collection: (name: string): unknown => (name === 'assets' ? assets : {}) }
  return { db, calls }
}

describe('backfillIsPublic', () => {
  it('marks hidden assets not public and the rest public, touching only docs missing the field', async () => {
    const { db, calls } = makeFakeDb()
    await backfillIsPublic(db)

    assert.equal(calls.length, 2)
    // Hidden: unavailable OR non-searchable, only where is_public is absent.
    assert.deepEqual(calls[0].filter, {
      is_public: { $exists: false },
      $or: [{ source_status: 'unavailable' }, { searchable: 'false' }]
    })
    assert.deepEqual(calls[0].update, { $set: { is_public: false } })
    // Public: everything else missing the field (matches legacy $ne semantics).
    assert.deepEqual(calls[1].filter, {
      is_public: { $exists: false },
      source_status: { $ne: 'unavailable' },
      searchable: { $ne: 'false' }
    })
    assert.deepEqual(calls[1].update, { $set: { is_public: true } })
  })
})
