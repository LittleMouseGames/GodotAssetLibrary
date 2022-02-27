import { Request, Response } from 'express'
import { TokenServices } from 'modules/common/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'modules/pages/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import { logger } from 'utility/logger'
import { GetAllCategoriesAndTheirAssetCount } from '../models/GET/GetAllCategoriesAndTheirAssetCount'
import { GetFourAssetsForHomepage } from '../models/GET/GetFeaturedAssetsForHomepage'
import { GetLastModifiedAssets } from '../models/GET/GetLastModifiedAssets'
import { GetNewestAssets } from '../models/GET/GetNewestAssets'
import { GetTrendingAssets } from '../models/GET/GetTrendingAssets'

export class HomepageService {
  public async render (req: Request, res: Response): Promise<void> {
    const authToken = striptags(req.cookies['auth-token'] ?? '')
    try {
      const trendingAssets = await GetTrendingAssets()
      const featuredAssets = await GetFourAssetsForHomepage()
      const newestAssets = await GetNewestAssets()
      const lastModifiedAssets = await GetLastModifiedAssets()
      const categoriesObject = await GetAllCategoriesAndTheirAssetCount()

      if (authToken !== '') {
        const tokenServices = TokenServices.getInstance()
        const hashedToken = tokenServices.hashToken(authToken)
        const assetPointers = [trendingAssets, featuredAssets, newestAssets, lastModifiedAssets]

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

      return res.render('templates/pages/homepage/index', { trendingAssets: trendingAssets, featuredAssets: featuredAssets, newestAssets: newestAssets, lastModifiedAssets: lastModifiedAssets, categoriesObject: categoriesObject })
    } catch (e: any) {
      logger.log('error', 'Failed to retrieve assets', ...[e])
      return res.render('templates/pages/homepage/index')
    }
  }
}
