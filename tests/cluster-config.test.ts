import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getWorkerCount,
  getDefaultMongoPool,
  getPrimaryMongoPool,
  DEFAULT_TOTAL_POOL_BUDGET
} from '../src/core/utils/clusterConfig'

/**
 * Run a check with a specific WORKER_COUNT and restore the previous value
 * afterwards, so the lazily-read env never leaks across tests.
 */
function withWorkerCount (value: string | undefined, fn: () => void): void {
  const previous = process.env.WORKER_COUNT
  if (value === undefined) {
    delete process.env.WORKER_COUNT
  } else {
    process.env.WORKER_COUNT = value
  }
  try {
    fn()
  } finally {
    if (previous === undefined) {
      delete process.env.WORKER_COUNT
    } else {
      process.env.WORKER_COUNT = previous
    }
  }
}

describe('clusterConfig', () => {
  it('uses WORKER_COUNT when set', () => {
    withWorkerCount('4', () => {
      assert.equal(getWorkerCount(), 4)
    })
    withWorkerCount('1', () => {
      assert.equal(getWorkerCount(), 1)
    })
  })

  it('clamps WORKER_COUNT to the maximum (16)', () => {
    withWorkerCount('999', () => {
      assert.equal(getWorkerCount(), 16)
    })
  })

  it('falls back to the CPU count for invalid or non-positive values', () => {
    withWorkerCount('not-a-number', () => {
      assert.ok(getWorkerCount() >= 1)
    })
    withWorkerCount('0', () => {
      assert.ok(getWorkerCount() >= 1)
    })
    withWorkerCount(undefined, () => {
      assert.ok(getWorkerCount() >= 1)
    })
  })

  it('scales the default Mongo pool per process to keep the total bounded', () => {
    withWorkerCount('4', () => {
      // 1500 / (4 workers + 1 primary) = 300 per process.
      assert.equal(getDefaultMongoPool(), 300)
    })
    withWorkerCount('2', () => {
      // 1500 / (2 workers + 1 primary) = 500 per process.
      assert.equal(getDefaultMongoPool(), 500)
    })
    // No 200-per-process floor: 16 workers -> 1500/17 = 88 per process, so the
    // aggregate (workers + primary) never exceeds the total budget.
    withWorkerCount('16', () => {
      assert.equal(getDefaultMongoPool(), 88)
    })
  })

  it('never lets the aggregate worker+primary pool exceed the total budget', () => {
    for (const count of ['1', '2', '3', '4', '6', '7', '8', '12', '16']) {
      withWorkerCount(count, () => {
        const workers = getWorkerCount()
        const total = (workers + 1) * getDefaultMongoPool()
        assert.ok(total <= DEFAULT_TOTAL_POOL_BUDGET, `workers=${workers} total=${total}`)
      })
    }
  })

  it('sizes the primary (job-only) pool much smaller than workers', () => {
    withWorkerCount('4', () => {
      assert.equal(getPrimaryMongoPool(), 75)
    })
    withWorkerCount('16', () => {
      assert.equal(getPrimaryMongoPool(), 22)
    })
  })
})
