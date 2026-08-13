import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runMigrations, Migration } from '../src/core/migrations'

interface FakeCollection {
  findOne: (query: { id: string }) => Promise<{ id: string, applied_at: Date } | null>
  insertOne: (doc: { id: string, applied_at: Date }) => Promise<void>
}

/**
 * A minimal stand-in for the Mongo `Db`/collection that `runMigrations`
 * touches (`migrations` only), so the runner can be tested without a server.
 */
function makeFakeDb (applied = new Map<string, Date>()): {
  db: any
  applied: Map<string, Date>
  recorded: string[]
} {
  const recorded: string[] = []
  const collection: FakeCollection = {
    findOne: async (query) => {
      const appliedAt = applied.get(query.id)
      return appliedAt !== undefined ? { id: query.id, applied_at: appliedAt } : null
    },
    insertOne: async (doc) => {
      applied.set(doc.id, doc.applied_at)
      recorded.push(doc.id)
    }
  }
  const db = { collection: (name: string) => (name === 'migrations' ? collection : {}) }
  return { db, applied, recorded }
}

describe('runMigrations', () => {
  it('records every migration when all succeed', async () => {
    const { db, recorded } = makeFakeDb()
    const migrations: Migration[] = [
      { id: 'a', description: 'A', run: async () => {} },
      { id: 'b', description: 'B', run: async () => {} }
    ]

    await runMigrations(db, migrations)

    assert.deepEqual(recorded, ['a', 'b'])
  })

  it('runs every migration independently when one fails', async () => {
    const { db, applied, recorded } = makeFakeDb()
    const runs: string[] = []
    const migrations: Migration[] = [
      { id: 'a', description: 'A', run: async () => { runs.push('a') } },
      { id: 'b', description: 'B', run: async () => { runs.push('b'); throw new Error('boom') } },
      { id: 'c', description: 'C', run: async () => { runs.push('c') } }
    ]

    await assert.rejects(
      runMigrations(db, migrations),
      /b/
    )

    // The failing migration must not prevent its neighbours from running.
    assert.deepEqual(runs, ['a', 'b', 'c'])
    // Successful migrations are recorded; the failed one is not, so it retries next run.
    assert.deepEqual(recorded, ['a', 'c'])
    assert.equal(applied.has('b'), false)
  })

  it('names every failing migration in the aggregate error', async () => {
    const { db } = makeFakeDb()
    const migrations: Migration[] = [
      { id: 'a', description: 'A', run: async () => { throw new Error('x') } },
      { id: 'b', description: 'B', run: async () => { throw new Error('y') } }
    ]

    await assert.rejects(
      runMigrations(db, migrations),
      /a.*b/
    )
  })

  it('skips already-applied migrations without running them', async () => {
    const applied = new Map<string, Date>([['a', new Date()]])
    const { db, recorded } = makeFakeDb(applied)
    const runs: string[] = []
    const migrations: Migration[] = [
      { id: 'a', description: 'A', run: async () => { runs.push('a') } },
      { id: 'b', description: 'B', run: async () => { runs.push('b') } }
    ]

    await runMigrations(db, migrations)

    assert.deepEqual(runs, ['b'])
    assert.deepEqual(recorded, ['b'])
  })
})
