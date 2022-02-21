import { Request, Response } from 'express'
import { logger } from 'utility/logger'
import { GetFourAssetsForHomepage } from '../models/GET/GetFeaturedAssetsForHomepage'
import { GetFourAssets } from '../models/GET/GetFourAssets'

export class HomepageService {
  public async render (_req: Request, res: Response): Promise<void> {
    try {
      const assets = await GetFourAssets()
      const featuredAssets = await GetFourAssetsForHomepage()

      return res.render('templates/pages/homepage/index', { assets: assets, featuredAssets: featuredAssets })
    } catch (e: any) {
      logger.log('error', 'Failed to retrieve assets', ...[e])
      return res.render('templates/pages/homepage/index')
    }
  }
}
