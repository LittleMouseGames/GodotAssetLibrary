import { Request, Response } from 'express'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'app/code/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import { logger } from 'core/utils/logger'
import { GetAllCategoriesAndTheirAssetCount } from '../models/GET/GetAllCategoriesAndTheirAssetCount'
import { GetFourAssetsForHomepage } from '../models/GET/GetFeaturedAssetsForHomepage'
import { GetLastModifiedAssets } from '../models/GET/GetLastModifiedAssets'
import { GetTrendingAssets } from '../models/GET/GetTrendingAssets'

export class HomepageService {
  public async render (req: Request, res: Response): Promise<void> {
    const authToken = striptags(req.cookies['auth-token'] ?? '')
    try {
      const [
        trendingAssets,
        featuredAssets,
        lastModifiedAssets,
        categoriesObject
      ] = await Promise.all([
        GetTrendingAssets(),
        GetFourAssetsForHomepage(),
        GetLastModifiedAssets(),
        GetAllCategoriesAndTheirAssetCount()
      ])

      if (authToken !== '') {
        const tokenServices = TokenServices.getInstance()
        const hashedToken = tokenServices.hashToken(authToken)
        const assetPointers = [trendingAssets, featuredAssets, lastModifiedAssets]

        try {
          const userSaved = await GetUserSavedAssets(hashedToken)
          assetPointers.forEach((element) => {
            element.forEach(asset => {
              asset.saved = userSaved.includes(asset.asset_id)
            })
          })
        } catch (e) {
          // ignore
        }
      }

      return res.render('templates/pages/homepage/index', { trendingAssets: trendingAssets, featuredAssets: featuredAssets, lastModifiedAssets: lastModifiedAssets, categoriesObject: categoriesObject })
    } catch (e: any) {
      logger.log('error', 'Failed to retrieve assets', [e])
      return res.render('templates/pages/homepage/index')
    }
  }
}
