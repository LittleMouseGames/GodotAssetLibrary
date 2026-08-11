import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRatingSummary } from '../src/core/utils/ratingSummary'

describe('buildRatingSummary', () => {
  it('handles assets with no ratings', () => {
    const summary = buildRatingSummary(0, 0)
    assert.equal(summary.total, 0)
    assert.equal(summary.approvalPercent, 0)
    assert.equal(summary.hasRatings, false)
    assert.equal(summary.label, 'No ratings yet')
    assert.equal(summary.score, 0)
  })

  it('computes approval percentage and sample size', () => {
    const summary = buildRatingSummary(75, 25)
    assert.equal(summary.total, 100)
    assert.equal(summary.approvalPercent, 75)
    assert.equal(summary.label, '75% approval · 100 ratings')
  })

  it('uses singular rating wording for a single vote', () => {
    const summary = buildRatingSummary(1, 0)
    assert.equal(summary.label, '100% approval · 1 rating')
  })

  it('reports a confidence-adjusted score', () => {
    const clean = buildRatingSummary(20, 0)
    const noisy = buildRatingSummary(100, 100)
    assert.ok(clean.score > noisy.score, `expected ${clean.score} > ${noisy.score}`)
  })

  it('guards against non-numeric input', () => {
    const summary = buildRatingSummary(Number.NaN, Number.NaN)
    assert.equal(summary.total, 0)
    assert.equal(summary.hasRatings, false)
  })
})
