import { Request, Response } from 'express'
import { GetAllFilters } from '../models/GET/GetAllFilters'
import { GetAssetsFromQuery } from '../models/GET/GetAssetsFromQuery'
import { GetAssetsWithoutQuery } from '../models/GET/GetAssetsWithoutQuery'
import { GetSearchResultFilters } from '../models/GET/GetSearchResultFilters'

export class SearchService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public async render (req: Request, res: Response): Promise<void> {
    const query = String(req.query.q) ?? ''
    const categoryParams = req.query.category ?? ''
    const engineParams = req.query.engine ?? ''

    let categoryArray: any[] = []
    let engineArray: any[] = []

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

    console.log(engineArray, categoryArray)

    // if no query we'll show all assets
    if (query === '' && categoryArray === [] && engineArray === []) {
      filters = await GetAllFilters()
      assets = await GetAssetsWithoutQuery(12)
    } else {
      filters = await GetSearchResultFilters(query)
      assets = await GetAssetsFromQuery(query, 12, categoryArray, engineArray)
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

    return res.render('templates/pages/search/search', {
      filters: { category: categoryFilters, engine: engineFilters },
      assets: assets,
      params: req.originalUrl
    })
  }

  public redirectToSearchUrl (req: Request, res: Response): void {
    const query = encodeURIComponent(req.body.query ?? '')
    res.redirect(`/search/?q=${query}`)
  }
}
