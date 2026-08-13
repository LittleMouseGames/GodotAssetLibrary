import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Request } from 'express'
import { parseSearchRequest, ParsedSearchRequest } from '../src/app/code/search/services/parseSearchRequest'
import { buildSearchFilter } from '../src/app/code/search/models/GET/buildSearchFilter'
import { buildSearchUrl, buildSearchViewModel } from '../src/app/code/search/services/buildSearchViewModel'
import { SearchFacets } from '../src/app/code/search/models/GET/GetSearchFacets'

function makeRequest (query: Record<string, unknown> = {}): Request {
  return { query, params: {} } as unknown as Request
}

function emptyFacets (): SearchFacets {
  return { categories: [], engines: [], types: [], supports: [], sources: [] }
}

function makeParsed (overrides: Partial<ParsedSearchRequest> = {}): ParsedSearchRequest {
  return {
    query: '',
    categories: [],
    engines: [],
    types: [],
    supports: [],
    source: '',
    featured: false,
    requestedSort: '',
    sort: 'last_modified',
    limit: 12,
    page: 0,
    skip: 0,
    displayPage: 1,
    ...overrides
  }
}

describe('parseSearchRequest source dimension', () => {
  it('parses a valid provider source', () => {
    const parsed = parseSearchRequest(makeRequest({ source: 'godot_store' }))
    assert.equal(parsed.source, 'godot_store')
  })

  it('rejects an unknown source (falls back to unified)', () => {
    const parsed = parseSearchRequest(makeRequest({ source: 'steam' }))
    assert.equal(parsed.source, '')
  })

  it('defaults to the unified view', () => {
    const parsed = parseSearchRequest(makeRequest({}))
    assert.equal(parsed.source, '')
  })
})

describe('buildSearchFilter source dimension', () => {
  it('collapses to group-preferred variants in the unified view', () => {
    const filter = buildSearchFilter('', {})
    assert.equal(filter.group_preferred, true)
    assert.equal(filter.is_public, true)
    assert.equal(filter.provider, undefined)
  })

  it('filters by provider (lifts the group collapse) when a source is selected', () => {
    const filter = buildSearchFilter('', { source: 'godot_store' })
    assert.equal(filter.provider, 'godot_store')
    assert.equal(filter.is_public, true)
    assert.equal(filter.group_preferred, undefined)
  })

  it('combines source with other filters', () => {
    const filter = buildSearchFilter('shader', { source: 'godot_asset_library', categories: ['shaders'], types: ['Shader'] })
    assert.equal(filter.provider, 'godot_asset_library')
    assert.deepEqual(filter.category_lowercase, { $in: ['shaders'] })
    assert.deepEqual(filter.type, { $in: ['Shader'] })
    assert.ok(filter.$text)
  })
})

describe('buildSearchUrl source dimension', () => {
  it('omits source when unified', () => {
    const url = buildSearchUrl(makeParsed({ source: '' }))
    assert.ok(!url.includes('source='))
  })

  it('includes source when selected', () => {
    const url = buildSearchUrl(makeParsed({ source: 'godot_store', page: 1 }))
    assert.ok(url.includes('source=godot_store'))
    assert.ok(url.includes('page=1'))
  })

  it('builds a source-filtered view model', () => {
    const facets = emptyFacets()
    facets.sources = [
      { value: 'godot_store', label: 'Godot Asset Store', count: 3 },
      { value: 'godot_asset_library', label: 'Legacy Asset Library', count: 7 }
    ]
    const viewModel = buildSearchViewModel(makeParsed({ source: 'godot_store' }), 3, facets)
    assert.equal(viewModel.source, 'godot_store')
    assert.equal(viewModel.sources.length, 2)
    const store = viewModel.sources.find(s => s.value === 'godot_store')
    assert.equal(store?.checked, true)
    assert.equal(store?.count, 3)
    // The clear-source link drops the source param entirely.
    assert.ok(!viewModel.sourceClearUrl.includes('source='))
    assert.equal(viewModel.activeFilterCount, 1)
  })
})
