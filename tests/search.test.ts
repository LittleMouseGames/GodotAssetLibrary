import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Request } from 'express'
import {
  parseSearchRequest,
  resolveSort,
  ParsedSearchRequest
} from '../src/app/code/search/services/parseSearchRequest'
import { parsePagination } from '../src/core/utils/pagination'
import {
  buildSearchUrl,
  buildSearchViewModel
} from '../src/app/code/search/services/buildSearchViewModel'
import { SearchFacets } from '../src/app/code/search/models/GET/GetSearchFacets'
import { buildSearchFilter } from '../src/app/code/search/models/GET/buildSearchFilter'
import { PUBLIC_ASSET_FILTER } from '../src/core/utils/publicCatalog'

function makeRequest (
  query: Record<string, unknown> = {},
  params: Record<string, string> = {}
): Request {
  return { query, params } as unknown as Request
}

function emptyFacets (): SearchFacets {
  return { categories: [], engines: [], types: [], supports: [] }
}

function makeParsed (overrides: Partial<ParsedSearchRequest> = {}): ParsedSearchRequest {
  return {
    query: '',
    categories: [],
    engines: [],
    types: [],
    supports: [],
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

describe('parseSearchRequest', () => {
  it('parses an empty request with safe defaults', () => {
    const parsed = parseSearchRequest(makeRequest())
    assert.equal(parsed.query, '')
    assert.deepEqual(parsed.categories, [])
    assert.deepEqual(parsed.engines, [])
    assert.deepEqual(parsed.types, [])
    assert.deepEqual(parsed.supports, [])
    assert.equal(parsed.featured, false)
    assert.equal(parsed.sort, 'last_modified')
    assert.equal(parsed.limit, 12)
    assert.equal(parsed.page, 0)
  })

  it('caps the query at 100 characters', () => {
    const longQuery = 'a'.repeat(200)
    const parsed = parseSearchRequest(makeRequest({ q: longQuery }))
    assert.equal(parsed.query.length, 100)
  })

  it('normalizes comma-separated and repeated categories to lowercase', () => {
    const parsed = parseSearchRequest(makeRequest({
      category: ['2D Tools,Templates', '2D Tools', 'Audio']
    }))
    assert.deepEqual(parsed.categories, ['2d tools', 'templates', 'audio'])
  })

  it('parses type and support filters', () => {
    const parsed = parseSearchRequest(makeRequest({
      type: ['Plugin', 'Shader'],
      support: ['Community']
    }))
    assert.deepEqual(parsed.types, ['Plugin', 'Shader'])
    assert.deepEqual(parsed.supports, ['Community'])
  })

  it('parses the featured flag only for the literal true value', () => {
    assert.equal(parseSearchRequest(makeRequest({ featured: 'true' })).featured, true)
    assert.equal(parseSearchRequest(makeRequest({ featured: '1' })).featured, false)
    assert.equal(parseSearchRequest(makeRequest({})).featured, false)
  })

  it('route category overrides query categories and normalizes + to space', () => {
    const parsed = parseSearchRequest(
      makeRequest({ category: ['Audio'] }, { category: '2D+Tools' })
    )
    assert.deepEqual(parsed.categories, ['2d tools'])
  })

  it('binds pagination to the shared utility', () => {
    const parsed = parseSearchRequest(makeRequest({ limit: '999', page: '5000' }))
    assert.equal(parsed.limit, 36)
    assert.equal(parsed.page, 1000)
    assert.equal(parsed.skip, 36000)
  })
})

describe('resolveSort', () => {
  it('defaults to relevance for a nonempty query', () => {
    assert.equal(resolveSort('', 'shader'), 'relevance')
    assert.equal(resolveSort('garbage', 'shader'), 'relevance')
  })

  it('defaults to last_modified for an empty query', () => {
    assert.equal(resolveSort('', ''), 'last_modified')
    assert.equal(resolveSort('relevance', ''), 'last_modified')
  })

  it('keeps valid explicit sorts regardless of query', () => {
    assert.equal(resolveSort('asset_rating', 'shader'), 'asset_rating')
    assert.equal(resolveSort('newest', ''), 'newest')
    assert.equal(resolveSort('last_modified', 'shader'), 'last_modified')
  })
})

describe('parsePagination', () => {
  it('rejects zero and negative limits', () => {
    assert.equal(parsePagination(0, 0).limit, 12)
    assert.equal(parsePagination(-5, 0).limit, 12)
  })

  it('caps the limit at 36', () => {
    assert.equal(parsePagination(100, 0).limit, 36)
  })

  it('rejects negative and non-integer pages', () => {
    assert.equal(parsePagination(12, -1).page, 0)
    assert.equal(parsePagination(12, 1.5).page, 0)
  })

  it('computes the skip from limit and page', () => {
    assert.deepEqual(parsePagination(12, 3), { limit: 12, page: 3, skip: 36 })
  })
})

describe('buildSearchUrl', () => {
  const base = {
    query: '',
    categories: [] as string[],
    engines: [] as string[],
    types: [] as string[],
    supports: [] as string[],
    featured: false,
    sort: 'relevance',
    limit: 12,
    page: 0
  }

  it('renders the bare search path when everything is default', () => {
    assert.equal(buildSearchUrl(base), '/search/')
  })

  it('includes the query when present', () => {
    assert.equal(buildSearchUrl({ ...base, query: 'shader' }), '/search/?q=shader')
  })

  it('appends repeated filters', () => {
    const url = buildSearchUrl({ ...base, categories: ['2d tools', 'audio'], engines: ['4.2'] })
    assert.equal(url, '/search/?category=2d+tools&category=audio&engine=4.2')
  })

  it('includes type, support and featured filters', () => {
    const url = buildSearchUrl({
      ...base,
      types: ['Plugin'],
      supports: ['Community'],
      featured: true
    })
    assert.equal(url, '/search/?type=Plugin&support=Community&featured=true')
  })

  it('omits default sort, limit and page', () => {
    const url = buildSearchUrl({ ...base, sort: 'asset_rating', limit: 24, page: 2 })
    assert.equal(url, '/search/?sort=asset_rating&limit=24&page=2')
  })
})

describe('buildSearchViewModel', () => {
  it('labels the asset_rating sort honestly as Highest rated', () => {
    const parsed = makeParsed({ sort: 'asset_rating' })
    const model = buildSearchViewModel(parsed, 100, emptyFacets())
    assert.equal(model.currentSortLabel, 'Highest rated')
    const option = model.sortOptions.find(option => option.value === 'asset_rating')
    assert.equal(option?.label, 'Highest rated')
    assert.equal(option?.selected, true)
  })

  it('marks facet options checked from the selected canonical values', () => {
    const parsed = makeParsed({
      categories: ['2d tools'],
      types: ['Plugin'],
      supports: ['Community']
    })
    const facets: SearchFacets = {
      categories: [{ value: '2d tools', label: '2D Tools', count: 10 }],
      engines: [],
      types: [{ value: 'Plugin', label: 'Plugin', count: 4 }],
      supports: [{ value: 'Community', label: 'Community', count: 7 }]
    }
    const model = buildSearchViewModel(parsed, 100, facets)
    assert.equal(model.categories[0]?.checked, true)
    assert.equal(model.types[0]?.checked, true)
    assert.equal(model.supports[0]?.checked, true)
  })

  it('counts type, support and featured toward active filters', () => {
    const parsed = makeParsed({ types: ['Plugin'], supports: ['Community'], featured: true })
    const model = buildSearchViewModel(parsed, 100, emptyFacets())
    assert.equal(model.activeFilterCount, 3)
    assert.equal(model.hasFilters, true)
  })

  it('clamps the displayed page to the last valid page', () => {
    const parsed = makeParsed({ page: 50, limit: 12 })
    const model = buildSearchViewModel(parsed, 25, emptyFacets())
    // total=25, limit=12 => 3 pages; page 50 clamps to the last (index 2).
    assert.equal(model.pagination.currentPage, 2)
    assert.equal(model.pagination.displayPage, 3)
    assert.equal(model.pagination.totalPages, 3)
  })

  it('renders an empty range when there are no results', () => {
    const parsed = makeParsed({})
    const model = buildSearchViewModel(parsed, 0, emptyFacets())
    assert.equal(model.pagination.rangeStart, 0)
    assert.equal(model.pagination.rangeEnd, 0)
  })
})

describe('buildSearchFilter with the version pin', () => {
  it('applies the major while no exact engine selection exists', () => {
    const filter = buildSearchFilter('', { godotMajor: 4 })
    assert.equal(filter.godot_major, 4)
    assert.equal(filter.godot_version, undefined)
    // PUBLIC_ASSET_FILTER always stays applied.
    assert.equal(filter.is_public, true)
  })

  it('drops the major when an exact engine selection is present', () => {
    const filter = buildSearchFilter('', { engines: ['3.4'], godotMajor: 4 })
    assert.equal(filter.godot_major, undefined)
    assert.deepEqual(filter.godot_version, { $in: ['3.4'] })
  })

  it('keeps text search and public visibility in the filter', () => {
    const filter = buildSearchFilter('shader', { godotMajor: 3 })
    assert.equal(filter.godot_major, 3)
    assert.deepEqual(filter.$text, { $search: 'shader', $caseSensitive: false })
    assert.equal(filter.is_public, PUBLIC_ASSET_FILTER.is_public)
  })
})
