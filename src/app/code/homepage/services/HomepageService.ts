import { Request, Response } from 'express'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'app/code/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import fromNow from 'fromnow'
import { GetAllCategoriesAndTheirAssetCount } from '../models/GET/GetAllCategoriesAndTheirAssetCount'
import { GetFourAssetsForHomepage } from '../models/GET/GetFeaturedAssetsForHomepage'
import { GetLastModifiedAssets } from '../models/GET/GetLastModifiedAssets'
import { GetTrendingAssets } from '../models/GET/GetTrendingAssets'
import { getAllGuides } from 'app/code/guides/models/guide'
import { attachCardExtras } from 'core/utils/cardView'

export class HomepageService {
  public async render (req: Request, res: Response): Promise<void> {
    const authToken = striptags(req.cookies['auth-token'] ?? '')

    // Fetch sections concurrently and degrade per-section instead of failing the
    // whole homepage when one query hiccups.
    const [trending, featured, lastModified, categories] = await Promise.allSettled([
      GetTrendingAssets(),
      GetFourAssetsForHomepage(),
      GetLastModifiedAssets(),
      GetAllCategoriesAndTheirAssetCount()
    ])

    const trendingAssets = trending.status === 'fulfilled' ? trending.value : []
    const featuredAssets = featured.status === 'fulfilled' ? featured.value : []
    const lastModifiedAssets = lastModified.status === 'fulfilled' ? lastModified.value : []
    const categoriesObject = categories.status === 'fulfilled' ? categories.value : {}

    attachCardExtras(trendingAssets)
    attachCardExtras(featuredAssets)
    attachCardExtras(lastModifiedAssets)

    for (const asset of lastModifiedAssets) {
      try {
        const modified = new Date(asset.modify_date as unknown as string)
        if (!isNaN(modified.getTime())) {
          asset.context = `Updated ${fromNow(modified, { suffix: true, zero: false, max: 1 })}`
        }
      } catch (e) {
        // ignore unparseable dates
      }
    }

    if (authToken !== '') {
      const tokenServices = TokenServices.getInstance()
      const hashedToken = tokenServices.hashToken(authToken)

      try {
        const userSaved = await GetUserSavedAssets(hashedToken)
        const assetPointers = [trendingAssets, featuredAssets, lastModifiedAssets]

        assetPointers.forEach((element) => {
          element.forEach(asset => {
            asset.saved = userSaved.includes(asset.asset_id)
          })
        })
      } catch (e) {
        // ignore
      }
    }

    // Guides are file-based editorial content; surface the first few on the
    // homepage to cross-link the guides section with the catalog.
    const homepageGuides = getAllGuides().slice(0, 4)

    return res.render('templates/pages/homepage/index', {
      trendingAssets,
      featuredAssets,
      lastModifiedAssets,
      categoriesObject,
      guides: homepageGuides
    })
  }
}
