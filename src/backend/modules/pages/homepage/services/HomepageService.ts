import { Request, Response } from 'express'
import { logger } from 'utility/logger'
import { GetFourAssetsForHomepage } from '../models/GET/GetFeaturedAssetsForHomepage'
import { GetLastModifiedAssets } from '../models/GET/GetLastModifiedAssets'
import { GetNewestAssets } from '../models/GET/GetNewestAssets'
import { GetTrendingAssets } from '../models/GET/GetTrendingAssets'

export class HomepageService {
  public async render (_req: Request, res: Response): Promise<void> {
    try {
      const trendingAssets = await GetTrendingAssets()
      const featuredAssets = await GetFourAssetsForHomepage()
      const newestAssets = await GetNewestAssets()
      const lastModifiedAssets = await GetLastModifiedAssets()

      return res.render('templates/pages/homepage/index', { trendingAssets: trendingAssets, featuredAssets: featuredAssets, newestAssets: newestAssets, lastModifiedAssets: lastModifiedAssets })
    } catch (e: any) {
      logger.log('error', 'Failed to retrieve assets', ...[e])
      return res.render('templates/pages/homepage/index')
    }
  }
}
