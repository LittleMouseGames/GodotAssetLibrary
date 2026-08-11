import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { wilsonScore } from '../src/core/utils/ratingScore'

describe('wilsonScore', () => {
  it('returns 0 when there are no votes', () => {
    assert.equal(wilsonScore(0, 0), 0)
    assert.equal(wilsonScore(0, 0), 0)
  })

  it('never exceeds 1', () => {
    assert.ok(wilsonScore(1000, 0) <= 1)
  })

  it('is never negative (clamps the lower bound)', () => {
    assert.ok(wilsonScore(0, 5) >= 0)
  })

  it('ranks a clean 20/0 above a noisy 100/100', () => {
    const clean = wilsonScore(20, 0)
    const noisy = wilsonScore(100, 100)
    assert.ok(clean > noisy, `expected ${clean} > ${noisy}`)
  })

  it('ranks more votes above fewer votes at the same ratio', () => {
    const few = wilsonScore(1, 0)
    const many = wilsonScore(20, 0)
    assert.ok(many > few, `expected ${many} > ${few}`)
  })

  it('ranks a 10/0 above an even 5/5', () => {
    const positive = wilsonScore(10, 0)
    const split = wilsonScore(5, 5)
    assert.ok(positive > split, `expected ${positive} > ${split}`)
  })

  it('is deterministic', () => {
    assert.equal(wilsonScore(30, 10), wilsonScore(30, 10))
  })

  it('guards against non-finite input', () => {
    assert.equal(wilsonScore(Number.NaN, 5), 0)
    assert.equal(wilsonScore(Infinity, 5), 0)
  })
})
