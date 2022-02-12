import { Request, Response } from 'express'
import { GetAllFilters } from '../models/GET/GetAllFilters'
import { GetSearchResultFilters } from '../models/GET/GetSearchResultFilters'

export class SearchService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public async render (req: Request, res: Response): Promise<void> {
    const query = req.body.query ?? req.query.q ?? ''

    const categoryFilters: {
      [key: string]: number
    } = {}

    const engineFilters: {
      [key: string]: number
    } = {}

    let filters = []

    // if no query we'll show all assets
    if (query === '') {
      filters = await GetAllFilters()
    } else {
      filters = await GetSearchResultFilters(query)
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

    return res.render('templates/pages/search/search', { categoryFilters: categoryFilters, engineFilters: engineFilters })
  }

  public redirectToSearchUrl (req: Request, res: Response): void {
    const query = req.body.query ?? ''
    res.redirect(`/search/?q=${query}`)
  }
}
