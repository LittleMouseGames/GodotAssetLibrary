import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ParsedSearchRequest } from '../src/app/code/search/services/parseSearchRequest'
import { buildSearchViewModel, buildSearchUrl } from '../src/app/code/search/services/buildSearchViewModel'
import { SearchFacets } from '../src/app/code/search/models/GET/GetSearchFacets'
import {
  normalizeTaxonomyKey,
  buildCategoryPath,
  buildEnginePath,
  displayCategoryLabel
} from '../src/core/utils/taxonomyUrl'
import { safeJsonLd } from '../src/core/utils/jsonLd'
import { PUBLIC_ASSET_FILTER } from '../src/core/utils/publicCatalog'

function emptyFacets (): SearchFacets {
  return { categories: [], engines: [], types: [], supports: [] }
}

function categoryFacets (): SearchFacets {
  return {
    categories: [{ value: '2d tools', label: '2D Tools', count: 47 }],
    engines: [],
    types: [],
    supports: []
  }
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

function categoryParsed (overrides: Partial<ParsedSearchRequest> = {}): ParsedSearchRequest {
  return makeParsed({
    routeCategory: '2d tools',
    categories: ['2d tools'],
    ...overrides
  })
}

function engineParsed (overrides: Partial<ParsedSearchRequest> = {}): ParsedSearchRequest {
  return makeParsed({
    routeEngine: '3.4',
    engines: ['3.4'],
    ...overrides
  })
}

describe('taxonomyUrl', () => {
  it('normalizes plus, percent-encoded and case variants to one key', () => {
    assert.equal(normalizeTaxonomyKey('2D+Tools'), '2d tools')
    assert.equal(normalizeTaxonomyKey('2d%20tools'), '2d tools')
    assert.equal(normalizeTaxonomyKey('  3D   Tools '), '3d tools')
    assert.equal(normalizeTaxonomyKey('shaders'), 'shaders')
  })

  it('builds canonical category and engine paths', () => {
    assert.equal(buildCategoryPath('2d tools'), '/category/2d%20tools')
    assert.equal(buildCategoryPath('2D+Tools'), '/category/2d%20tools')
    assert.equal(buildEnginePath('3.4'), '/engine/3.4')
    assert.equal(buildEnginePath('4.0'), '/engine/4.0')
  })

  it('title-cases display labels', () => {
    assert.equal(displayCategoryLabel('2d tools'), '2D Tools')
    assert.equal(displayCategoryLabel('tools'), 'Tools')
    assert.equal(displayCategoryLabel('ui'), 'UI')
  })
})

describe('safeJsonLd', () => {
  it('escapes characters that could terminate the script element', () => {
    const payload = { name: 'A</script><script>alert(1)</script>' }
    const out = safeJsonLd(payload)
    assert.ok(!out.includes('</script>'))
    assert.ok(out.includes('\\u003c'))
    // The output must still parse as the original JSON value.
    assert.deepEqual(JSON.parse(out), payload)
  })
})

describe('PUBLIC_ASSET_FILTER', () => {
  it('selects only denormalized public assets via an indexed equality', () => {
    assert.deepEqual(PUBLIC_ASSET_FILTER, { is_public: true })
  })
})

describe('buildSearchUrl', () => {
  it('omits defaults for the base browse view', () => {
    assert.equal(buildSearchUrl({
      query: '',
      categories: [],
      engines: [],
      types: [],
      supports: [],
      featured: false,
      sort: 'last_modified',
      limit: 12,
      page: 0
    }), '/search/')
  })

  it('keeps meaningful query params', () => {
    assert.equal(buildSearchUrl({
      query: 'shader',
      categories: ['shaders'],
      engines: ['4.2'],
      types: [],
      supports: [],
      featured: false,
      sort: 'relevance',
      limit: 24,
      page: 1
    }), '/search/?q=shader&category=shaders&engine=4.2&limit=24&page=1')
  })
})

describe('buildSearchViewModel indexing policy', () => {
  it('indexes the default category view with the canonical taxonomy path', () => {
    const model = buildSearchViewModel(categoryParsed(), 47, categoryFacets())
    assert.equal(model.noindex, false)
    assert.equal(model.canonicalUrl, '/category/2d%20tools')
    assert.equal(model.title, '2D Tools for Godot | Godot Asset Library')
  })

  it('noindexes sort variants on category pages', () => {
    const model = buildSearchViewModel(
      categoryParsed({ sort: 'asset_rating', requestedSort: 'asset_rating' }),
      47,
      categoryFacets()
    )
    assert.equal(model.noindex, true)
  })

  it('indexes paginated category pages with page-param canonical', () => {
    const model = buildSearchViewModel(categoryParsed({ page: 1 }), 47, categoryFacets())
    assert.equal(model.noindex, false)
    assert.equal(model.canonicalUrl, '/category/2d%20tools?page=1')
    // Pagination stays on the taxonomy path, not /search/.
    assert.equal(model.pagination.nextUrl, '/category/2d%20tools?page=2')
    assert.equal(model.pagination.prevUrl, '/category/2d%20tools')
  })

  it('keeps sort and clear links on the taxonomy path', () => {
    const model = buildSearchViewModel(categoryParsed(), 47, categoryFacets())
    const highestRated = model.sortOptions.find(option => option.value === 'asset_rating')
    assert.equal(highestRated?.url, '/category/2d%20tools?sort=asset_rating')
    assert.equal(model.categoryClearUrl, '/category/2d%20tools')
  })

  it('keeps the query term and default-sort rules on taxonomy links', () => {
    const model = buildSearchViewModel(
      categoryParsed({ query: 'water', sort: 'relevance', requestedSort: 'relevance', page: 1 }),
      47,
      categoryFacets()
    )
    const highestRated = model.sortOptions.find(option => option.value === 'asset_rating')
    assert.equal(highestRated?.url, '/category/2d%20tools?q=water&sort=asset_rating')
    assert.equal(model.pagination.nextUrl, '/category/2d%20tools?q=water&page=2')
    assert.equal(model.pagination.prevUrl, '/category/2d%20tools?q=water')
  })

  it('noindexes extra filters on category pages', () => {
    const model = buildSearchViewModel(
      categoryParsed({ types: ['addon'] }),
      47,
      categoryFacets()
    )
    assert.equal(model.noindex, true)
  })

  it('indexes the default engine view', () => {
    const model = buildSearchViewModel(engineParsed(), 12, emptyFacets())
    assert.equal(model.noindex, false)
    assert.equal(model.canonicalUrl, '/engine/3.4')
    assert.equal(model.title, 'Godot 3.4 Assets | Godot Asset Library')
  })

  it('indexes the base browse-all search page', () => {
    const model = buildSearchViewModel(makeParsed(), 52, emptyFacets())
    assert.equal(model.noindex, false)
    assert.equal(model.canonicalUrl, '/search/')
  })

  it('noindexes search queries', () => {
    const model = buildSearchViewModel(
      makeParsed({ query: 'shader', sort: 'relevance', requestedSort: 'relevance' }),
      5,
      emptyFacets()
    )
    assert.equal(model.noindex, true)
    assert.equal(model.canonicalUrl, '/search/?q=shader')
  })

  it('noindexes search filter combinations', () => {
    const model = buildSearchViewModel(
      makeParsed({ categories: ['shaders'] }),
      5,
      emptyFacets()
    )
    assert.equal(model.noindex, true)
  })
})
