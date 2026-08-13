import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapStoreCategory } from '../src/app/utilities/fetchFromGodotStore/services/categoryMapping'
import { StoreTagData } from '../src/app/utilities/fetchFromGodotStore/schema/storeApi'

function tags (...slugs: string[]): StoreTagData[] {
  return slugs.map(slug => ({ slug, display_name: slug }))
}

describe('mapStoreCategory', () => {
  it('maps template tags to Templates even for type 0 addons', () => {
    const mapping = mapStoreCategory(0, tags('template', 'game'))
    assert.equal(mapping.category, 'Templates')
    assert.equal(mapping.category_lowercase, 'templates')
  })

  it('maps demo tags to Demos', () => {
    assert.equal(mapStoreCategory(1, tags('demo', 'example')).category, 'Demos')
  })

  it('maps type 1 with no stronger tag to Projects', () => {
    assert.equal(mapStoreCategory(1, tags('fun')).category, 'Projects')
  })

  it('maps tooling + dimension to 2D/3D Tools', () => {
    assert.equal(mapStoreCategory(0, tags('plugin', '2d', 'tilemap')).category, '2D Tools')
    assert.equal(mapStoreCategory(0, tags('editor', '3d', 'terrain')).category, '3D Tools')
    assert.equal(mapStoreCategory(0, tags('tool')).category, 'Tools')
  })

  it('maps pure asset packs by dimension', () => {
    assert.equal(mapStoreCategory(0, tags('2d', 'pixelart', 'sprites')).category, '2D Assets')
    assert.equal(mapStoreCategory(0, tags('3d', 'models', 'glb')).category, '3D Assets')
  })

  it('maps vfx/shaders/materials/audio/ui/scripts', () => {
    assert.equal(mapStoreCategory(0, tags('vfx', 'particles')).category, 'VFX')
    assert.equal(mapStoreCategory(0, tags('shader')).category, 'Shaders')
    assert.equal(mapStoreCategory(0, tags('pbr', 'material')).category, 'Materials')
    assert.equal(mapStoreCategory(0, tags('music', 'sfx')).category, 'Audio')
    assert.equal(mapStoreCategory(0, tags('ui', 'theme')).category, 'UI')
    assert.equal(mapStoreCategory(0, tags('gdscript', 'script')).category, 'Scripts')
  })

  it('falls back to Misc for unknown addons', () => {
    assert.equal(mapStoreCategory(0, tags('random-thing')).category, 'Misc')
    assert.equal(mapStoreCategory(0, undefined).category, 'Misc')
  })

  it('keeps the original tags untouched (mapping derives only the category)', () => {
    const input = tags('plugin', '2d')
    mapStoreCategory(0, input)
    assert.equal(input.length, 2)
  })
})
