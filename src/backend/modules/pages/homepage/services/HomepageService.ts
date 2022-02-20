import { Request, Response } from 'express'
import { logger } from 'utility/logger'
import { GetFourAssets } from '../models/GET/GetFourAssets'

export class HomepageService {
  public async render (_req: Request, res: Response): Promise<void> {
    try {
      const assets = await GetFourAssets()

      return res.render('templates/pages/homepage/index', { assets: assets })
    } catch (e: any) {
      logger.log('error', 'Failed to retrieve assets', ...[e])
      return res.render('templates/pages/homepage/index')
    }
  }
}
