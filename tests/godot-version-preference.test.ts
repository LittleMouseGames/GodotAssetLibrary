import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeGodotVersionPreference,
  godotVersionPreferenceLabel,
  parseGodotMajor,
  deriveEffectiveMajor,
  godotMajorFilter,
  godotMajorCacheSuffix
} from '../src/core/utils/godotVersionPreference'

describe('Godot version preference', () => {
  it('defaults invalid/missing preferences to 4.x', () => {
    assert.equal(normalizeGodotVersionPreference(undefined), '4')
    assert.equal(normalizeGodotVersionPreference(''), '4')
    assert.equal(normalizeGodotVersionPreference('latest'), '4')
    assert.equal(normalizeGodotVersionPreference('4.x'), '4')
    assert.equal(normalizeGodotVersionPreference(4), '4')
  })

  it('accepts the four allowlisted values', () => {
    assert.equal(normalizeGodotVersionPreference('2'), '2')
    assert.equal(normalizeGodotVersionPreference('3'), '3')
    assert.equal(normalizeGodotVersionPreference('4'), '4')
    assert.equal(normalizeGodotVersionPreference('all'), 'all')
  })

  it('renders display labels', () => {
    assert.equal(godotVersionPreferenceLabel('2'), '2.x')
    assert.equal(godotVersionPreferenceLabel('3'), '3.x')
    assert.equal(godotVersionPreferenceLabel('4'), '4.x')
    assert.equal(godotVersionPreferenceLabel('all'), 'All')
  })

  it('parses numeric majors from exact version strings', () => {
    assert.equal(parseGodotMajor('4.2'), 4)
    assert.equal(parseGodotMajor('3.5.1'), 3)
    assert.equal(parseGodotMajor('2'), 2)
    assert.equal(parseGodotMajor(' 4.0 '), 4)
    assert.equal(parseGodotMajor(''), undefined)
    assert.equal(parseGodotMajor('latest'), undefined)
    assert.equal(parseGodotMajor('0.1'), undefined)
    assert.equal(parseGodotMajor(undefined), undefined)
  })

  it('derives the effective major: no exact selection uses the preference', () => {
    assert.equal(deriveEffectiveMajor([], '4'), 4)
    assert.equal(deriveEffectiveMajor([], '3'), 3)
    assert.equal(deriveEffectiveMajor([], 'all'), undefined)
  })

  it('exact selections override the preference with their shared major', () => {
    assert.equal(deriveEffectiveMajor(['3.4'], '4'), 3)
    assert.equal(deriveEffectiveMajor(['4.2', '4.0'], '3'), 4)
    assert.equal(deriveEffectiveMajor(['4.2'], 'all'), 4)
  })

  it('mixed-major exact selections lift the major restriction', () => {
    assert.equal(deriveEffectiveMajor(['3.4', '4.2'], '4'), undefined)
  })

  it('builds the Mongo major predicate', () => {
    assert.deepEqual(godotMajorFilter(4), { godot_major: 4 })
    assert.deepEqual(godotMajorFilter(undefined), {})
  })

  it('produces stable cache suffixes', () => {
    assert.equal(godotMajorCacheSuffix(4), '4')
    assert.equal(godotMajorCacheSuffix(undefined), 'all')
  })
})
