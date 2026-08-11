import { ParsedSearchRequest } from './parseSearchRequest'
import { compareVersions } from '../models/GET/sortUtils'
import { FacetGroup, SearchFacets } from '../models/GET/GetSearchFacets'

export interface SortOption { value: string, label: string, url: string, selected: boolean }
export interface LimitOption { value: string, label: string, url: string, selected: boolean }
export interface FacetOption { value: string, label: string, count: number, checked: boolean }
export interface PageItem { label: string, url: string, current: boolean }

export interface SearchViewModel {
  query: string
  currentSort: string
  currentSortLabel: string
  currentLimit: number
  displayPage: number
  sortOptions: SortOption[]
  limitOptions: LimitOption[]
  categories: FacetOption[]
  engines: FacetOption[]
  types: FacetOption[]
  supports: FacetOption[]
  featured: boolean
  clearAllUrl: string
  categoryClearUrl: string
  engineClearUrl: string
  typeClearUrl: string
  supportClearUrl: string
  hasFilters: boolean
  activeFilterCount: number
  pagination: {
    total: number
    limit: number
    currentPage: number
    displayPage: number
    totalPages: number
    hasPrev: boolean
    hasNext: boolean
    prevUrl: string
    nextUrl: string
    rangeStart: number
    rangeEnd: number
    pages: PageItem[]
  }
}

interface UrlStateInternal {
  query: string
  categories: string[]
  engines: string[]
  types: string[]
  supports: string[]
  featured: boolean
  sort: string
  limit: number
  page: number
}

export type UrlState = UrlStateInternal

const SORT_LABELS: Record<string, string> = {
  relevance: 'Relevance',
  asset_rating: 'Highest rated',
  newest: 'Newest',
  last_modified: 'Recently updated'
}

const DEFAULT_LIMIT = 12
const LIMIT_OPTIONS = [12, 24, 36]
const PAGE_WINDOW = 5

/** Build a canonical search URL from state, omitting defaults. */
export function buildSearchUrl (state: UrlState): string {
  const params = new URLSearchParams()
  if (state.query !== '') params.set('q', state.query)
  for (const category of state.categories) params.append('category', category)
  for (const engine of state.engines) params.append('engine', engine)
  for (const type of state.types) params.append('type', type)
  for (const support of state.supports) params.append('support', support)
  if (state.featured) params.set('featured', 'true')
  if (state.sort !== 'relevance') params.set('sort', state.sort)
  if (state.limit !== DEFAULT_LIMIT) params.set('limit', String(state.limit))
  if (state.page !== 0) params.set('page', String(state.page))
  const queryString = params.toString()
  return `/search/${queryString !== '' ? `?${queryString}` : ''}`
}

function toFacetOptions (groups: FacetGroup[], selected: string[]): FacetOption[] {
  return groups.map(group => ({
    value: group.value,
    label: group.label,
    count: group.count,
    checked: selected.includes(group.value)
  }))
}

export function buildSearchViewModel (
  parsed: ParsedSearchRequest,
  total: number,
  facets: SearchFacets
): SearchViewModel {
  const { query, categories, engines, types, supports, featured, sort, limit, page } = parsed
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.min(page, totalPages - 1)
  const displayPage = currentPage + 1
  const rangeStart = total === 0 ? 0 : (currentPage * limit) + 1
  const rangeEnd = Math.min(total, (currentPage + 1) * limit)

  const base: UrlState = { query, categories, engines, types, supports, featured, sort, limit, page: currentPage }

  // "Relevance" only means something with a text query, so it is hidden (not
  // just relabelled) when browsing with an empty query.
  const sortKeys = Object.keys(SORT_LABELS).filter(value => query !== '' || value !== 'relevance')
  const sortOptions: SortOption[] = sortKeys.map(value => ({
    value,
    label: SORT_LABELS[value],
    url: buildSearchUrl({ ...base, sort: value, page: 0 }),
    selected: value === sort
  }))

  const limitOptions: LimitOption[] = LIMIT_OPTIONS.map(value => ({
    value: String(value),
    label: String(value),
    url: buildSearchUrl({ ...base, limit: value, page: 0 }),
    selected: value === limit
  }))

  const categoriesOptions = toFacetOptions(facets.categories, categories)
  const enginesOptions = toFacetOptions(facets.engines, engines).sort((a, b) => compareVersions(a.value, b.value))
  const typesOptions = toFacetOptions(facets.types, types)
  const supportsOptions = toFacetOptions(facets.supports, supports)

  // Per-group "clear" links (empty just that dimension, keep everything else).
  const categoryClearUrl = buildSearchUrl({ ...base, categories: [], page: 0 })
  const engineClearUrl = buildSearchUrl({ ...base, engines: [], page: 0 })
  const typeClearUrl = buildSearchUrl({ ...base, types: [], page: 0 })
  const supportClearUrl = buildSearchUrl({ ...base, supports: [], page: 0 })

  const hasFilters = categories.length > 0 || engines.length > 0 || types.length > 0 ||
    supports.length > 0 || featured
  const activeFilterCount = categories.length + engines.length + types.length +
    supports.length + (featured ? 1 : 0)

  const pages: PageItem[] = []
  const windowStart = Math.max(0, currentPage - Math.floor(PAGE_WINDOW / 2))
  const windowEnd = Math.min(totalPages - 1, windowStart + PAGE_WINDOW - 1)
  for (let p = windowStart; p <= windowEnd; p++) {
    pages.push({ label: String(p + 1), url: buildSearchUrl({ ...base, page: p }), current: p === currentPage })
  }

  return {
    query,
    currentSort: sort,
    currentSortLabel: SORT_LABELS[sort] ?? SORT_LABELS.last_modified,
    currentLimit: limit,
    displayPage,
    sortOptions,
    limitOptions,
    categories: categoriesOptions,
    engines: enginesOptions,
    types: typesOptions,
    supports: supportsOptions,
    featured,
    clearAllUrl: buildSearchUrl({
      ...base,
      categories: [],
      engines: [],
      types: [],
      supports: [],
      featured: false,
      page: 0
    }),
    categoryClearUrl,
    engineClearUrl,
    typeClearUrl,
    supportClearUrl,
    hasFilters,
    activeFilterCount,
    pagination: {
      total,
      limit,
      currentPage,
      displayPage,
      totalPages,
      hasPrev: currentPage > 0,
      hasNext: currentPage < totalPages - 1,
      prevUrl: currentPage > 0 ? buildSearchUrl({ ...base, page: currentPage - 1 }) : '',
      nextUrl: currentPage < totalPages - 1 ? buildSearchUrl({ ...base, page: currentPage + 1 }) : '',
      rangeStart,
      rangeEnd,
      pages
    }
  }
}
