import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseGodotVersionKey,
  parseGodotVersionParts,
  rangeContainsVersionKey,
  rangeContainsMajor,
  normalizeGodotRanges,
  choosePreferredRelease,
  materializeGodotMajors,
  buildCompatibilitySummary,
  godotVersionKeyToString
} from '../src/core/utils/godotCompatibility'

describe('parseGodotVersionKey', () => {
  it('parses dotted versions into a sortable numeric key', () => {
    assert.equal(parseGodotVersionKey('4'), 4_000_000)
    assert.equal(parseGodotVersionKey('4.2'), 4_002_000)
    assert.equal(parseGodotVersionKey('4.2.1'), 4_002_001)
    assert.equal(parseGodotVersionKey('3.4'), 3_004_000)
    assert.equal(parseGodotVersionKey(' 4.5 '), 4_005_000)
  })

  it('orders versions correctly', () => {
    const a = parseGodotVersionKey('4.4.1') as number
    const b = parseGodotVersionKey('4.5.1') as number
    const c = parseGodotVersionKey('4.5') as number
    assert.ok(a < b)
    assert.ok(c < b)
    assert.ok(a < c)
  })

  it('rejects invalid versions', () => {
    assert.equal(parseGodotVersionKey('latest'), null)
    assert.equal(parseGodotVersionKey(''), null)
    assert.equal(parseGodotVersionKey('4.x'), null)
    assert.equal(parseGodotVersionKey('a.b.c'), null)
    assert.equal(parseGodotVersionKey(undefined), null)
    assert.equal(parseGodotVersionKey('4.2.1.0'), null)
  })

  it('round-trips via godotVersionKeyToString', () => {
    assert.equal(godotVersionKeyToString(4_005_001), '4.5.1')
    assert.equal(godotVersionKeyToString(4_002_000), '4.2')
    assert.equal(godotVersionKeyToString(4_000_000), '4')
    assert.equal(godotVersionKeyToString(null), null)
  })
})

describe('parseGodotVersionParts', () => {
  it('fills missing minor/patch with zero', () => {
    assert.deepEqual(parseGodotVersionParts('4'), { major: 4, minor: 0, patch: 0 })
    assert.deepEqual(parseGodotVersionParts('4.2'), { major: 4, minor: 2, patch: 0 })
    assert.deepEqual(parseGodotVersionParts('4.2.1'), { major: 4, minor: 2, patch: 1 })
  })
})

describe('rangeContainsVersionKey / rangeContainsMajor', () => {
  it('is inclusive on both bounds', () => {
    const range = {
      min_version_key: parseGodotVersionKey('4.4'),
      max_version_key: parseGodotVersionKey('4.6')
    }
    assert.equal(rangeContainsVersionKey(range, parseGodotVersionKey('4.4') as number), true)
    assert.equal(rangeContainsVersionKey(range, parseGodotVersionKey('4.5') as number), true)
    assert.equal(rangeContainsVersionKey(range, parseGodotVersionKey('4.6') as number), true)
    assert.equal(rangeContainsVersionKey(range, parseGodotVersionKey('4.3') as number), false)
    assert.equal(rangeContainsVersionKey(range, parseGodotVersionKey('4.7') as number), false)
  })

  it('treats null bounds as unbounded', () => {
    const minOnly = { min_version_key: parseGodotVersionKey('4.5'), max_version_key: null }
    assert.equal(rangeContainsVersionKey(minOnly, parseGodotVersionKey('4.5') as number), true)
    assert.equal(rangeContainsVersionKey(minOnly, parseGodotVersionKey('4.6') as number), true)
    assert.equal(rangeContainsVersionKey(minOnly, parseGodotVersionKey('4.4') as number), false)

    const maxOnly = { min_version_key: null, max_version_key: parseGodotVersionKey('4.2') }
    assert.equal(rangeContainsVersionKey(maxOnly, parseGodotVersionKey('3.4') as number), true)
    assert.equal(rangeContainsVersionKey(maxOnly, parseGodotVersionKey('4.2') as number), true)
    assert.equal(rangeContainsVersionKey(maxOnly, parseGodotVersionKey('4.3') as number), false)
  })

  it('detects major-line containment', () => {
    const ranges = normalizeGodotRanges([{
      id: 1,
      version: 'v1',
      stable: true,
      min_godot_version: '4.4',
      max_godot_version: null
    }])
    assert.equal(rangeContainsMajor(ranges[0], 4), true)
    assert.equal(rangeContainsMajor(ranges[0], 3), false)
    assert.equal(rangeContainsMajor(ranges[0], 2), false)
  })
})

describe('normalizeGodotRanges + choosePreferredRelease', () => {
  const releases = [
    { id: 11, version: 'v1.1.0', stable: true, min_godot_version: '4.4', max_godot_version: '4.4.1', created: '2025-04-29' },
    { id: 901, version: 'v1.1.5', stable: true, min_godot_version: '4.4', max_godot_version: null, created: '2026-01-06' },
    { id: 1204, version: 'v1.1.6', stable: true, min_godot_version: '4.5.1', max_godot_version: null, created: '2026-04-23' },
    { id: 9999, version: 'v2.0-beta', stable: false, min_godot_version: '4.6', max_godot_version: null, created: '2026-05-01' }
  ]

  it('prefers stable releases and the newest stable by date', () => {
    const ranges = normalizeGodotRanges(releases)
    const preferred = choosePreferredRelease(ranges)
    assert.equal(preferred?.release_id, 1204)
  })

  it('falls back to the newest unstable when no stable exists', () => {
    const ranges = normalizeGodotRanges([
      { id: 1, version: 'a', stable: false, min_godot_version: '4.0', max_godot_version: null, created: '2025-01-01' },
      { id: 2, version: 'b', stable: false, min_godot_version: '4.0', max_godot_version: null, created: '2025-02-01' }
    ])
    assert.equal(choosePreferredRelease(ranges)?.release_id, 2)
  })

  it('drops invalid ranges (min above max) and non-numeric ids', () => {
    const ranges = normalizeGodotRanges([
      { id: 1, version: 'bad', stable: true, min_godot_version: '4.6', max_godot_version: '4.4' },
      { id: 0, version: 'zero', stable: true, min_godot_version: '4.0', max_godot_version: null }
    ])
    assert.deepEqual(ranges, [])
  })

  it('materializes the supported major lines', () => {
    const ranges = normalizeGodotRanges(releases)
    assert.deepEqual(materializeGodotMajors(ranges), [4])
  })
})

describe('buildCompatibilitySummary', () => {
  it('builds scalar projection + label from a preferred stable release', () => {
    const summary = buildCompatibilitySummary([
      { id: 1204, version: 'v1.1.6', stable: true, min_godot_version: '4.5.1', max_godot_version: null, created: '2026-04-23' },
      { id: 901, version: 'v1.1.5', stable: true, min_godot_version: '4.4', max_godot_version: null, created: '2026-01-06' }
    ])
    assert.equal(summary.godot_version, '4.5.1')
    assert.equal(summary.godot_major, 4)
    assert.deepEqual(summary.godot_majors, [4])
    assert.equal(summary.compatibility_label, 'Godot 4.5.1+')
  })

  it('produces a range label when min and max differ', () => {
    const summary = buildCompatibilitySummary([
      { id: 1, version: 'v1', stable: true, min_godot_version: '4.4', max_godot_version: '4.6', created: '2025-01-01' }
    ])
    assert.equal(summary.compatibility_label, 'Godot 4.4 \u2013 4.6')
  })

  it('returns empty projection when there is no usable release', () => {
    const summary = buildCompatibilitySummary([])
    assert.equal(summary.godot_version, '')
    assert.equal(summary.godot_major, undefined)
    assert.deepEqual(summary.godot_majors, [])
    assert.equal(summary.compatibility_label, '')
  })
})
