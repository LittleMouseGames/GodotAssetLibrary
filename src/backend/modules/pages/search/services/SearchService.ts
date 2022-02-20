import { Request, Response } from 'express'
import { GetAllFilters } from '../models/GET/GetAllFilters'
import { GetAssetsCountFromQuery } from '../models/GET/GetAssetsCountFromQuery'
import { GetAssetsCountWithoutQuery } from '../models/GET/GetAssetsCountWithoutQuery'
import { GetAssetsFromQuery } from '../models/GET/GetAssetsFromQuery'
import { GetAssetsWithoutQuery } from '../models/GET/GetAssetsWithoutQuery'
import { GetSearchResultFilters } from '../models/GET/GetSearchResultFilters'

export class SearchService {
  public async render (req: Request, res: Response): Promise<void> {
    const query = String(req.query.q ?? '')
    const categoryParams = req.query.category ?? ''
    const engineParams = req.query.engine ?? ''
    let limit = Number(req.query.limit ?? 12)
    const page = Number(req.query.page) ?? 0

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page
    let categoryArray: any[] = []
    let engineArray: any[] = []
    let totalAssetsForQuery = 0

    if (typeof categoryParams === 'string' || categoryParams instanceof String) {
      if (categoryParams === '') {
        categoryArray = []
      } else {
        categoryArray = [categoryParams]
      }
    } else {
      categoryArray = categoryParams as any[]
    }

    if (typeof engineParams === 'string' || engineParams instanceof String) {
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

    const engineFilters: {
      [key: string]: number
    } = {}

    let filters = []

    let assets: any = []

    // if no query we'll show all assets
    if (query === '' && categoryArray.length === 0 && engineArray.length === 0) {
      filters = await GetAllFilters()
      assets = await GetAssetsWithoutQuery(limit, skip)
      totalAssetsForQuery = await GetAssetsCountWithoutQuery()
    } else {
      filters = await GetSearchResultFilters(query)
      assets = await GetAssetsFromQuery(query, limit, skip, categoryArray, engineArray)
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

    const pageBanner = {
      title: `Search results ${query === '' ? '' : 'for: ' + query}`,
      info: `Found <strong>${totalAssetsForQuery} assets</strong> from <strong>${Object.keys(categoryFilters).length} categories</strong>`
    }

    return res.render('templates/pages/search/search', {
      filters: { category: categoryFilters, engine: engineFilters },
      assets: assets,
      params: req.originalUrl,
      pageBanner: pageBanner
    })
  }

  public redirectToSearchUrl (req: Request, res: Response): void {
    const query = encodeURIComponent(req.body.query ?? '')
    res.redirect(`/search/?q=${query}`)
  }
}
