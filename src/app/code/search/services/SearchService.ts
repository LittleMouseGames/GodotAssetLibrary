import { Request, Response } from 'express'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'app/code/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import { GetAssetsCountFromQuery } from '../models/GET/GetAssetsCountFromQuery'
import { GetAssetsFromQuery } from '../models/GET/GetAssetsFromQuery'
import { GetSearchFacets } from '../models/GET/GetSearchFacets'
import { buildSearchFilter } from '../models/GET/buildSearchFilter'
import { parsePagination } from 'core/utils/pagination'

export class SearchService {
  public async render (req: Request, res: Response): Promise<void> {
    const query = striptags(String(req.query.q ?? '').substr(0, 100))
    let categoryParams = striptags(String(req.query.category ?? ''))
    let engineParams = striptags(String(req.query.engine ?? ''))
    const { limit, skip } = parsePagination(req.query.limit, req.query.page)
    const authToken = striptags(req.cookies['auth-token'] ?? '')
    // || so an empty string also falls back to the default
    const requestedSort = striptags(String(req.query.sort ?? ''))
    const sort = requestedSort === '' ? 'relevance' : requestedSort
    let title = `Search results ${query === '' ? '' : 'for: ' + query}`
    const plusToSpaceRegex = /\+|&plus;|%2b/
    let inCategory = false

    if (req?.params?.category != null) {
      const convertedCategory = striptags(req.params.category.toLocaleLowerCase().replace(plusToSpaceRegex, ' '))
      categoryParams = convertedCategory
      title = `Assets in category: <span>${convertedCategory}</span>`
      inCategory = true
    }

    if (req?.params?.engine != null) {
      const convertedEngine = striptags(req.params.engine.toLocaleLowerCase().replace(plusToSpaceRegex, ' '))
      engineParams = convertedEngine
      title = `Assets for engine: <span>${convertedEngine}</span>`
      inCategory = true
    }

    const sortMap: {[key: string]: any} = {
      relevance: { godot_version: -1 },
      asset_rating: { upvotes: -1 },
      newest: { added_date: -1 },
      last_modified: { modify_date: -1 }
    }

    // unknown values fall back to relevance rather than returning a 400
    const sortOrder = sortMap[sort] ?? sortMap.relevance

    let categoryArray: any[] = []
    let engineArray: any[] = []

    if (typeof categoryParams === 'string') {
      if (categoryParams === '') {
        categoryArray = []
      } else {
        categoryArray = categoryParams.split(',')
      }
    } else {
      categoryArray = categoryParams as any[]
    }

    if (typeof engineParams === 'string') {
      if (engineParams === '') {
        engineArray = []
      } else {
        engineArray = engineParams.split(',')
      }
    } else {
      engineArray = engineParams as any[]
    }

    const filter = buildSearchFilter(query, categoryArray, engineArray)

    const [assets, totalAssetsForQuery, { categoryFilters, engineFilters }] = await Promise.all([
      GetAssetsFromQuery(query, limit, skip, sortOrder, categoryArray, engineArray),
      GetAssetsCountFromQuery(query, categoryArray, engineArray),
      GetSearchFacets(filter)
    ])

    let info = `Found <strong>${totalAssetsForQuery} assets</strong> for query`
    if (inCategory) {
      info = `Showing <strong>${totalAssetsForQuery} assets</strong> in category`
    }

    const pageBanner = {
      title: title,
      info: info
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
      filters: { category: categoryFilters, engine: engineFilters },
      grid: assets,
      params: req.originalUrl,
      pageBanner: pageBanner,
      originalQuery: query
    })
  }

  public redirectToSearchUrl (req: Request, res: Response): void {
    const query = encodeURIComponent(striptags(req.body.query ?? ''))
    res.redirect(`/search/?q=${query}`)
  }
}
