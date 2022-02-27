import { Request, Response } from 'express'
import { TokenServices } from 'modules/common/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'modules/pages/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import { GetAllFilters } from '../models/GET/GetAllFilters'
import { GetAssetsCountFromQuery } from '../models/GET/GetAssetsCountFromQuery'
import { GetAssetsCountWithoutQuery } from '../models/GET/GetAssetsCountWithoutQuery'
import { GetAssetsFromQuery } from '../models/GET/GetAssetsFromQuery'
import { GetAssetsWithoutQuery } from '../models/GET/GetAssetsWithoutQuery'
import { GetSearchResultFilters } from '../models/GET/GetSearchResultFilters'

export class SearchService {
  public async render (req: Request, res: Response): Promise<void> {
    const query = striptags(String(req.query.q ?? ''))
    const categoryParams = striptags(String(req.query.category ?? ''))
    const engineParams = striptags(String(req.query.engine ?? ''))
    let limit = Number(req.query.limit ?? 12)
    const page = Number(req.query.page ?? 0)
    const authToken = striptags(req.cookies['auth-token'] ?? '')
    const sort = striptags(String(req.query.sort ?? 'relevance'))

    const sortMap: {[key: string]: any} = {
      relevance: { godot_version: -1 },
      asset_rating: { upvotes: -1 },
      newest: { added_date: -1 },
      last_modified: { modify_date: -1 }
    }

    if (sort !== 'undefined' && !(sort in sortMap)) {
      throw new Error('Invalid sort parameter, expeting nothing, `relevance`, `rating`, `newest`, or `last_modified`')
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
        categoryArray = [categoryParams]
      }
    } else {
      categoryArray = categoryParams as any[]
    }

    if (typeof engineParams === 'string') {
      if (engineParams === '') {
        engineArray = []
      } else {
        engineArray = [engineParams]
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
      filters = await GetAllFilters()
      assets = await GetAssetsWithoutQuery(limit, skip, sortMap[sort])
      totalAssetsForQuery = await GetAssetsCountWithoutQuery()
    } else {
      filters = await GetSearchResultFilters(query)
      assets = await GetAssetsFromQuery(query, limit, skip, sortMap[sort], categoryArray, engineArray)
      totalAssetsForQuery = await GetAssetsCountFromQuery(query, categoryArray, engineArray)
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

    const pageBanner = {
      title: `Search results ${query === '' ? '' : 'for: ' + query}`,
      info: `Found <strong>${totalAssetsForQuery} assets</strong> from <strong>${Object.keys(categoryFilters).length} categories</strong>`
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
