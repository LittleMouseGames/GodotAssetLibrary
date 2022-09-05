import { Request, Response } from 'express'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'app/code/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import { GetAllFilters } from '../models/GET/GetAllFilters'
import { GetAssetsCountFromQuery } from '../models/GET/GetAssetsCountFromQuery'
import { GetAssetsCountWithoutQuery } from '../models/GET/GetAssetsCountWithoutQuery'
import { GetAssetsFromQuery } from '../models/GET/GetAssetsFromQuery'
import { GetAssetsWithoutQuery } from '../models/GET/GetAssetsWithoutQuery'
import { GetSearchResultFilters } from '../models/GET/GetSearchResultFilters'

export class SearchService {
  public async render (req: Request, res: Response): Promise<void> {
    const query = striptags(String(req.query.q ?? '').substr(0, 100))
    const page = Number(req.query.page ?? 0)
    const authToken = striptags(req.cookies['auth-token'] ?? '')
    const sort = striptags(String(req.query.sort ?? 'relevance'))
    const plusToSpaceRegex = /\+|&plus;|%2b/

    let categoryParams = striptags(String(req.query.category ?? ''))
    let engineParams = striptags(String(req.query.engine ?? ''))
    let limit = Number(req.query.limit ?? 12)
    let title = `Search results ${query === '' ? '' : 'for: ' + query}`
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

    if (sort !== 'undefined' && !(sort in sortMap)) {
      throw new Error(`Invalid sort parameter '${sort.substring(0, 30)}', expeting nothing, 'relevance', 'rating', 'newest', or 'last_modified'`)
    }

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page
    let categoryArray: any[] = []
    let engineArray: any[] = []
    let totalAssetsForQuery = 0

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

    const categoryFilters: {
      [key: string]: number
    } = {}

    let engineFilters: {
      [key: string]: number
    } = {}

    let filters = []

    let assets: any = []

    // if no query we'll show all assets
    if (query === '' && categoryArray.length === 0 && engineArray.length === 0) {
      [
        filters,
        assets,
        totalAssetsForQuery
      ] = await Promise.all([
        GetAllFilters(),
        GetAssetsWithoutQuery(limit, skip, sortMap[sort]),
        GetAssetsCountWithoutQuery()
      ])
    } else {
      [
        filters,
        assets,
        totalAssetsForQuery
      ] = await Promise.all([
        GetSearchResultFilters(query),
        GetAssetsFromQuery(query, limit, skip, sortMap[sort], categoryArray, engineArray),
        GetAssetsCountFromQuery(query, categoryArray, engineArray)
      ])
    }

    for (const filter of filters) {
      if (filter.category in categoryFilters) {
        categoryFilters[filter.category] = categoryFilters[filter.category] + 1
      } else {
        categoryFilters[filter.category] = 1
      }

      if (filter.godot_version in engineFilters) {
        engineFilters[filter.godot_version] = engineFilters[filter.godot_version] + 1
      } else {
        engineFilters[filter.godot_version] = 1
      }
    }

    /** sort by key */
    engineFilters = Object.keys(engineFilters).sort().reverse().reduce(
      (obj: {[key: string]: number}, key) => {
        obj[key] = engineFilters[key]
        return obj
      },
      {}
    )

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
