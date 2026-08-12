import { Request, Response } from 'express'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'app/code/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import { GetSearchResults, SearchResults } from '../models/GET/GetSearchResults'
import { GetSearchFacets, SearchFacets } from '../models/GET/GetSearchFacets'
import { GetRelatedAssets } from 'app/code/asset/models/GET/GetRelatedAssets'
import { SearchFilterOptions } from '../models/GET/buildSearchFilter'
import { parseSearchRequest } from './parseSearchRequest'
import { buildSearchUrl, buildSearchViewModel } from './buildSearchViewModel'
import { displayCategoryLabel } from 'core/utils/taxonomyUrl'
import { getCategoryContent } from './categoryContent'
import { escapeHtml } from 'core/utils/escapeHtml'
import { attachCardExtras } from 'core/utils/cardView'
import { cacheGetOrLoad } from 'core/utils/dragonfly'

interface CachedSearchData {
  searchData: SearchResults
  facets: SearchFacets
}

const parsedSearchTtl = Number.parseInt(process.env.CACHE_SEARCH_TTL_SECONDS ?? '', 10)
const SEARCH_CACHE_TTL_SECONDS = Number.isFinite(parsedSearchTtl) && parsedSearchTtl > 0
  ? parsedSearchTtl
  : 60

function searchCacheKey (
  query: string,
  limit: number,
  skip: number,
  sort: string,
  options: SearchFilterOptions
): string {
  // Parsing already deduplicates/caps filters. Sort copies here so equivalent
  // parameter orderings share one key and cannot inflate cache cardinality.
  return `gda:v1:search:${Buffer.from(JSON.stringify({
    query,
    limit,
    skip,
    sort,
    categories: [...(options.categories ?? [])].sort(),
    engines: [...(options.engines ?? [])].sort(),
    types: [...(options.types ?? [])].sort(),
    supports: [...(options.supports ?? [])].sort(),
    featured: options.featured === true
  })).toString('base64url')}`
}

export class SearchService {
  public async render (req: Request, res: Response): Promise<void> {
    const parsed = parseSearchRequest(req)
    const authToken = striptags(req.cookies['auth-token'] ?? '')

    const filterOptions: SearchFilterOptions = {
      categories: parsed.categories,
      engines: parsed.engines,
      types: parsed.types,
      supports: parsed.supports,
      featured: parsed.featured
    }

    // Results + total count now come from ONE aggregation ($facet) and the
    // four facets are consolidated into another, so the per-request Mongo
    // fan-out drops from ~6 operations to ~2, directly relieving the pool
    // pressure that caused the prod 503s.
    const cached = await cacheGetOrLoad<CachedSearchData>(
      searchCacheKey(parsed.query, parsed.limit, parsed.skip, parsed.sort, filterOptions),
      SEARCH_CACHE_TTL_SECONDS,
      async () => {
        const [searchData, facets] = await Promise.all([
          GetSearchResults(parsed.query, parsed.limit, parsed.skip, parsed.sort, filterOptions),
          GetSearchFacets(parsed.query, filterOptions)
        ])
        return { searchData, facets }
      },
      10_000
    )
    // attachCardExtras and authenticated saved-state mutate asset objects.
    const { searchData, facets } = JSON.parse(JSON.stringify(cached.value)) as CachedSearchData
    const { assets, total: totalAssetsForQuery } = searchData

    attachCardExtras(assets)

    // Single-result searches surface a "You may also like" row so visitors
    // can keep exploring without going back.
    let relatedForSearch: any[] = []
    if (parsed.query !== '' && assets.length === 1) {
      try {
        relatedForSearch = await GetRelatedAssets(
          assets[0].category,
          assets[0].godot_version,
          assets[0].type,
          assets[0].asset_id
        )
        attachCardExtras(relatedForSearch)
      } catch (e) {
        // ignore
      }
    }

    // A page that points past the end should redirect to the real last page
    // rather than rendering an empty grid with contradictory pagination.
    if (parsed.page > 0 && assets.length === 0 && totalAssetsForQuery > 0) {
      const lastPage = Math.ceil(totalAssetsForQuery / parsed.limit) - 1
      const redirectUrl = buildSearchUrl({
        query: parsed.query,
        categories: parsed.categories,
        engines: parsed.engines,
        types: parsed.types,
        supports: parsed.supports,
        featured: parsed.featured,
        sort: parsed.sort,
        limit: parsed.limit,
        page: lastPage
      })
      return res.redirect(redirectUrl)
    }

    const search = buildSearchViewModel(parsed, totalAssetsForQuery, facets)

    // Human-readable H1: use the display-case category label when available.
    let title = parsed.query === '' ? 'Browse Godot assets' : `Search results for: ${parsed.query}`
    if (parsed.routeCategory !== undefined) {
      const categoryLabel = search.categories.find(c => c.value === parsed.routeCategory)?.label
      title = `Assets in category: ${categoryLabel ?? displayCategoryLabel(parsed.routeCategory)}`
    } else if (parsed.routeEngine !== undefined) {
      title = `Assets for engine: Godot ${parsed.routeEngine}`
    }

    let info = parsed.query !== ''
      ? `Found <strong>${totalAssetsForQuery} assets</strong> matching &ldquo;<strong>${escapeHtml(parsed.query)}</strong>&rdquo;`
      : `Browsing <strong>${totalAssetsForQuery} assets</strong>`
    if (parsed.routeCategory !== undefined) {
      info = `Showing <strong>${totalAssetsForQuery} assets</strong> in this category`
    } else if (parsed.routeEngine !== undefined) {
      info = `Showing <strong>${totalAssetsForQuery} assets</strong> for this engine`
    }

    const pageBanner = {
      title: title,
      info: info,
      breadcrumb: search.breadcrumb
    }

    if (authToken !== '') {
      const tokenServices = TokenServices.getInstance()
      const hashedToken = tokenServices.hashToken(authToken)

      try {
        const userSaved = await GetUserSavedAssets(hashedToken)

        for (const asset of assets) {
          asset.saved = userSaved.includes(asset.asset_id)
        }
      } catch (e) {
        // ignore
      }
    }

    return res.render('templates/pages/search/search', {
      filters: facets,
      search: search,
      grid: assets,
      params: req.originalUrl,
      pageBanner: pageBanner,
      originalQuery: parsed.query,
      canonicalUrl: search.canonicalUrl,
      noindex: search.noindex,
      categoryContent: parsed.routeCategory !== undefined ? getCategoryContent(parsed.routeCategory) : undefined,
      routeEngine: parsed.routeEngine,
      relatedForSearch: relatedForSearch
    })
  }

  public redirectToSearchUrl (req: Request, res: Response): void {
    const query = encodeURIComponent(striptags(req.body.query ?? ''))
    res.redirect(`/search/?q=${query}`)
  }
}
