import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ensureIndexes } from '../src/core/ensureIndexes'

interface FakeCollection {
  createIndex: (key: Record<string, unknown>) => Promise<string>
  indexes: () => Promise<Array<{ key: Record<string, unknown> }>>
}

/**
 * A fake db whose collections record every createIndex attempt. Any label in
 * `failLabels` (e.g. "assets.godot_version") throws, so the test can prove a
 * failing index never aborts the remaining ones.
 */
function makeFakeDb (failLabels: Set<string>): { db: any, attempted: string[], created: string[] } {
  const attempted: string[] = []
  const created: string[] = []
  const makeCollection = (name: string): FakeCollection => ({
    createIndex: async (key: Record<string, unknown>) => {
      const label = `${name}.${Object.keys(key)[0] ?? ''}`
      attempted.push(label)
      if (failLabels.has(label)) {
        throw new Error(`boom on ${label}`)
      }
      created.push(label)
      return label
    },
    // A text index exists, so the post-loop verification logs "verified".
    indexes: async () => [{ key: { title: 'text' } }]
  })
  const db = { collection: (name: string): FakeCollection => makeCollection(name) }
  return { db, attempted, created }
}

describe('ensureIndexes', () => {
  it('attempts every index even when one fails', async () => {
    const { db, attempted, created } = makeFakeDb(new Set(['assets.godot_version']))
    await ensureIndexes(db)

    // Indexes before AND after the failing one are all attempted.
    assert.ok(attempted.includes('assets.asset_id'))
    assert.ok(attempted.includes('assets.godot_version'))
    assert.ok(attempted.includes('assets.rating_score'))
    assert.ok(attempted.includes('users.username'))
    assert.ok(attempted.includes('reviews.asset_id'))
    assert.ok(attempted.includes('reports.human_id'))
    // The LAST index still runs despite earlier failures.
    assert.ok(attempted.includes('info.type'))

    // The failing index was attempted but not created; every other one was.
    assert.ok(!created.includes('assets.godot_version'))
    assert.equal(created.length, attempted.length - 1)
  })

  it('never throws and keeps going with multiple failures', async () => {
    const { db, attempted, created } = makeFakeDb(new Set(['assets.featured', 'users.username', 'reviews.human_id']))
    await ensureIndexes(db) // must resolve, never reject

    for (const failed of ['assets.featured', 'users.username', 'reviews.human_id']) {
      assert.ok(attempted.includes(failed))
      assert.ok(!created.includes(failed))
    }
    assert.ok(attempted.includes('info.type'))
    assert.equal(created.length, attempted.length - 3)
  })
})
