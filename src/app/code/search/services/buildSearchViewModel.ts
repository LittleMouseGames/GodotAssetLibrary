import { ParsedSearchRequest } from './parseSearchRequest'
import { compareVersions } from '../models/GET/sortUtils'
import { FacetGroup, SearchFacets } from '../models/GET/GetSearchFacets'
import { buildCategoryPath, buildEnginePath, displayCategoryLabel } from 'core/utils/taxonomyUrl'

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
  /** <title> tag content, computed per route. */
  title: string
  /** meta description, computed per route. */
  description: string
  /** Canonical path (without host). */
  canonicalUrl: string
  /** Whether this representation should be excluded from the index. */
  noindex: boolean
  breadcrumb: Array<{ label: string, url: string }>
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

/**
 * Build the URL for a given search state. On taxonomy routes (category or
 * engine) the route's own filter lives in the path (`/category/shaders`), so
 * pagination, sort, limit and clear links keep the canonical path instead of
 * falling back to `/search/?category=...`. Pure search pages keep the
 * normalized `/search/` URLs.
 */
function buildUrlFor (parsed: ParsedSearchRequest, state: UrlState): string {
  const { routeCategory, routeEngine } = parsed
  if (routeCategory !== undefined || routeEngine !== undefined) {
    const base = routeCategory !== undefined
      ? buildCategoryPath(routeCategory)
      : buildEnginePath(routeEngine ?? '')
    const params = new URLSearchParams()
    if (state.query !== '') params.set('q', state.query)
    const extraCategories = routeCategory !== undefined
      ? state.categories.filter(c => c !== routeCategory)
      : state.categories
    const extraEngines = routeEngine !== undefined
      ? state.engines.filter(e => e !== routeEngine)
      : state.engines
    for (const category of extraCategories) params.append('category', category)
    for (const engine of extraEngines) params.append('engine', engine)
    for (const type of state.types) params.append('type', type)
    for (const support of state.supports) params.append('support', support)
    if (state.featured) params.set('featured', 'true')
    // Same context-aware default sort as buildSearchUrl: "relevance" only has
    // meaning with a query; "last_modified" is the default for an empty query.
    const omitSort = state.sort === 'relevance' || (state.query === '' && state.sort === 'last_modified')
    if (!omitSort) params.set('sort', state.sort)
    if (state.limit !== DEFAULT_LIMIT) params.set('limit', String(state.limit))
    if (state.page !== 0) params.set('page', String(state.page))
    const queryString = params.toString()
    return `${base}${queryString !== '' ? `?${queryString}` : ''}`
  }
  return buildSearchUrl(state)
}

/** Build a canonical search URL from state, omitting defaults. */
export function buildSearchUrl (state: UrlState): string {
  const params = new URLSearchParams()
  if (state.query !== '') params.set('q', state.query)
  for (const category of state.categories) params.append('category', category)
  for (const engine of state.engines) params.append('engine', engine)
  for (const type of state.types) params.append('type', type)
  for (const support of state.supports) params.append('support', support)
  if (state.featured) params.set('featured', 'true')
  // Omit the context-aware default sort: "relevance" (query mode) or
  // "last_modified" with an empty query (browse mode), so default views keep
  // canonical URLs.
  const omitSort = state.sort === 'relevance' || (state.query === '' && state.sort === 'last_modified')
  if (!omitSort) params.set('sort', state.sort)
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
    url: buildUrlFor(parsed, { ...base, sort: value, page: 0 }),
    selected: value === sort
  }))

  const limitOptions: LimitOption[] = LIMIT_OPTIONS.map(value => ({
    value: String(value),
    label: String(value),
    url: buildUrlFor(parsed, { ...base, limit: value, page: 0 }),
    selected: value === limit
  }))

  const categoriesOptions = toFacetOptions(facets.categories, categories)
  const enginesOptions = toFacetOptions(facets.engines, engines).sort((a, b) => compareVersions(b.value, a.value))
  const typesOptions = toFacetOptions(facets.types, types)
  const supportsOptions = toFacetOptions(facets.supports, supports)

  // Per-group "clear" links (empty just that dimension, keep everything else).
  const categoryClearUrl = buildUrlFor(parsed, { ...base, categories: [], page: 0 })
  const engineClearUrl = buildUrlFor(parsed, { ...base, engines: [], page: 0 })
  const typeClearUrl = buildUrlFor(parsed, { ...base, types: [], page: 0 })
  const supportClearUrl = buildUrlFor(parsed, { ...base, supports: [], page: 0 })

  const hasFilters = categories.length > 0 || engines.length > 0 || types.length > 0 ||
    supports.length > 0 || featured
  const activeFilterCount = categories.length + engines.length + types.length +
    supports.length + (featured ? 1 : 0)

  const pages: PageItem[] = []
  const windowStart = Math.max(0, currentPage - Math.floor(PAGE_WINDOW / 2))
  const windowEnd = Math.min(totalPages - 1, windowStart + PAGE_WINDOW - 1)
  for (let p = windowStart; p <= windowEnd; p++) {
    pages.push({ label: String(p + 1), url: buildUrlFor(parsed, { ...base, page: p }), current: p === currentPage })
  }

  // Indexing policy + route-specific metadata. Taxonomy pages (category/engine)
  // are indexable in their default view including valid pagination; any query,
  // extra filter, non-default sort or page-size is noindex. Pure search pages
  // are indexable only for the base browse-all view.
  const routeCategory = parsed.routeCategory
  const routeEngine = parsed.routeEngine
  const extraCategories = routeCategory !== undefined
    ? categories.filter(c => c !== routeCategory)
    : categories
  const extraEngines = routeEngine !== undefined
    ? engines.filter(e => e !== routeEngine)
    : engines
  const hasExtraFilters = extraCategories.length > 0 || extraEngines.length > 0 ||
    types.length > 0 || supports.length > 0 || featured
  const defaultSort = 'last_modified'

  let noindex: boolean
  let canonicalUrl: string
  let title: string
  let description: string
  let breadcrumb: Array<{ label: string, url: string }>

  if (routeCategory !== undefined || routeEngine !== undefined) {
    const isDefaultView = query === '' && !hasExtraFilters && sort === defaultSort && limit === DEFAULT_LIMIT
    noindex = !isDefaultView
    const basePath = routeCategory !== undefined
      ? buildCategoryPath(routeCategory)
      : buildEnginePath(routeEngine ?? '')
    const canonicalParams = new URLSearchParams()
    if (page > 0) canonicalParams.set('page', String(page))
    canonicalUrl = basePath + (canonicalParams.toString() !== '' ? `?${canonicalParams.toString()}` : '')

    const label = routeCategory !== undefined
      ? (facets.categories.find(c => c.value === routeCategory)?.label ?? displayCategoryLabel(routeCategory))
      : `Godot ${routeEngine}`
    title = routeCategory !== undefined
      ? `${label} for Godot | Godot Asset Library`
      : `Godot ${routeEngine} Assets | Godot Asset Library`
    description = routeCategory !== undefined
      ? `Browse ${total} free ${label.toLocaleLowerCase()} for the Godot Engine, from plugins and shaders to templates and full projects.`
      : `Browse ${total} free Godot assets compatible with Godot ${routeEngine}, from tools and scripts to shaders and templates.`

    breadcrumb = [
      { label: 'Home', url: '/' },
      routeCategory !== undefined
        ? { label, url: buildCategoryPath(routeCategory) }
        : { label: `Godot ${routeEngine}`, url: buildEnginePath(routeEngine ?? '') },
      ...(page > 0 ? [{ label: `Page ${displayPage}`, url: '' }] : [])
    ]
  } else {
    const isDefaultView = query === '' && !hasExtraFilters && sort === defaultSort &&
      limit === DEFAULT_LIMIT && page === 0
    noindex = !isDefaultView
    canonicalUrl = buildSearchUrl({ ...base, page: isDefaultView ? 0 : page })
    title = query !== ''
      ? `Search: ${query} | Godot Asset Library`
      : 'Browse Free Godot Assets | Godot Asset Library'
    description = query !== ''
      ? `Search results for \u201C${query}\u201D across the Godot Asset Library catalog.`
      : 'Browse every free and open source Godot asset: plugins, shaders, scripts, templates, projects and tools.'
    breadcrumb = [
      { label: 'Home', url: '/' },
      { label: query !== '' ? 'Search' : 'Browse', url: '' }
    ]
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
    clearAllUrl: buildUrlFor(parsed, {
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
    title,
    description,
    canonicalUrl,
    noindex,
    breadcrumb,
    pagination: {
      total,
      limit,
      currentPage,
      displayPage,
      totalPages,
      hasPrev: currentPage > 0,
      hasNext: currentPage < totalPages - 1,
      prevUrl: currentPage > 0 ? buildUrlFor(parsed, { ...base, page: currentPage - 1 }) : '',
      nextUrl: currentPage < totalPages - 1 ? buildUrlFor(parsed, { ...base, page: currentPage + 1 }) : '',
      rangeStart,
      rangeEnd,
      pages
    }
  }
}
