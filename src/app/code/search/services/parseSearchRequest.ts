import { Request } from 'express'
import striptags from 'striptags'
import { parsePagination } from 'core/utils/pagination'

const QUERY_MAX_LENGTH = 100
const MAX_FILTERS = 20
const VALID_SORTS = ['relevance', 'asset_rating', 'newest', 'last_modified']

export interface ParsedSearchRequest {
  query: string
  categories: string[]
  engines: string[]
  types: string[]
  supports: string[]
  featured: boolean
  requestedSort: string
  /** Resolved sort key, context-aware (never "relevance" for an empty query). */
  sort: string
  limit: number
  /** Zero-based internal page (matches parsePagination). */
  page: number
  skip: number
  /** One-based page for display. */
  displayPage: number
  routeCategory?: string
  routeEngine?: string
}

/** Accept repeated and comma-separated values, then trim/dedupe/cap. */
function normalizeList (value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of values) {
    for (const part of String(raw ?? '').split(',')) {
      const item = striptags(part).trim()
      if (item === '') continue
      if (seen.has(item)) continue
      seen.add(item)
      result.push(item)
      if (result.length >= MAX_FILTERS) break
    }
    if (result.length >= MAX_FILTERS) break
  }

  return result
}

/**
 * "Relevance" only has meaning when there is a text query. For an empty query
 * the truthful default ordering is "Recently Updated" (last_modified).
 */
export function resolveSort (requested: string, query: string): string {
  const key = VALID_SORTS.includes(requested)
    ? requested
    : (query !== '' ? 'relevance' : 'last_modified')
  if (key === 'relevance' && query === '') return 'last_modified'
  return key
}

export function parseSearchRequest (req: Request): ParsedSearchRequest {
  const query = striptags(String(req.query.q ?? '')).trim().slice(0, QUERY_MAX_LENGTH)

  let categories = normalizeList(req.query.category)
  let engines = normalizeList(req.query.engine)
  const types = normalizeList(req.query.type)
  const supports = normalizeList(req.query.support)
  const featured = String(req.query.featured ?? '') === 'true'

  const routeCategory = req?.params?.category != null
    ? striptags(String(req.params.category).toLocaleLowerCase().replace(/\+|&plus;|%2b/g, ' ')).trim()
    : undefined
  const routeEngine = req?.params?.engine != null
    ? striptags(String(req.params.engine).toLocaleLowerCase().replace(/\+|&plus;|%2b/g, ' ')).trim()
    : undefined

  if (routeCategory !== undefined && routeCategory !== '') categories = [routeCategory]
  if (routeEngine !== undefined && routeEngine !== '') engines = [routeEngine]

  // Normalize category values to the lowercase canonical key used by the
  // database (`category_lowercase`) so checkbox values, chips, and Mongo
  // matching all agree regardless of the display-case facet label.
  categories = categories.map(category => category.toLocaleLowerCase())

  const { limit, page, skip } = parsePagination(req.query.limit, req.query.page)
  const requestedSort = striptags(String(req.query.sort ?? ''))
  const sort = resolveSort(requestedSort, query)

  return {
    query,
    categories,
    engines,
    types,
    supports,
    featured,
    requestedSort,
    sort,
    limit,
    page,
    skip,
    displayPage: page + 1,
    routeCategory,
    routeEngine
  }
}
