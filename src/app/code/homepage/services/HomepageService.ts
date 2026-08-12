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
import { cacheGetOrLoad } from 'core/utils/dragonfly'

interface HomepageSnapshot {
  trendingAssets: any[]
  featuredAssets: any[]
  lastModifiedAssets: any[]
  categoriesObject: any
}

const parsedHomepageTtl = Number.parseInt(process.env.CACHE_HOMEPAGE_TTL_SECONDS ?? '', 10)
const HOMEPAGE_CACHE_TTL_SECONDS = Number.isFinite(parsedHomepageTtl) && parsedHomepageTtl > 0
  ? parsedHomepageTtl
  : 60

async function loadHomepageSnapshot (): Promise<HomepageSnapshot> {
  // Fetch sections concurrently and degrade per-section instead of failing the
  // whole homepage when one query hiccups.
  const [trending, featured, lastModified, categories] = await Promise.allSettled([
    GetTrendingAssets(),
    GetFourAssetsForHomepage(),
    GetLastModifiedAssets(),
    GetAllCategoriesAndTheirAssetCount()
  ])

  return {
    trendingAssets: trending.status === 'fulfilled' ? trending.value : [],
    featuredAssets: featured.status === 'fulfilled' ? featured.value : [],
    lastModifiedAssets: lastModified.status === 'fulfilled' ? lastModified.value : [],
    categoriesObject: categories.status === 'fulfilled' ? categories.value : {}
  }
}

export class HomepageService {
  public async render (req: Request, res: Response): Promise<void> {
    const authToken = striptags(req.cookies['auth-token'] ?? '')

    const cached = await cacheGetOrLoad(
      'gda:v1:homepage',
      HOMEPAGE_CACHE_TTL_SECONDS,
      loadHomepageSnapshot,
      10_000
    )
    // Card decoration and saved-state are request-specific mutations. Clone
    // the shared cached value so one request can never alter another.
    const snapshot = JSON.parse(JSON.stringify(cached.value)) as HomepageSnapshot
    const { trendingAssets, featuredAssets, lastModifiedAssets, categoriesObject } = snapshot

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
