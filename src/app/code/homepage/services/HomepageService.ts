import { Request, Response } from 'express'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserSavedAssets } from 'app/code/dashboard/models/GET/GetUserSavedAssets'
import striptags from 'striptags'
import fromNow from 'fromnow'
import { GetAllCategoriesAndTheirAssetCount } from '../models/GET/GetAllCategoriesAndTheirAssetCount'
import { GetCategoryCountsByMajor } from '../models/GET/GetCategoryCountsByMajor'
import { GetFourAssetsForHomepage } from '../models/GET/GetFeaturedAssetsForHomepage'
import { GetLastModifiedAssets } from '../models/GET/GetLastModifiedAssets'
import { GetTrendingAssets } from '../models/GET/GetTrendingAssets'
import { getAllGuides } from 'app/code/guides/models/guide'
import { attachCardExtras } from 'core/utils/cardView'
import { cacheGetOrLoad } from 'core/utils/dragonfly'
import {
  GODOT_VERSION_PREFERENCE_COOKIE,
  godotMajorCacheSuffix
} from 'core/utils/godotVersionPreference'
import { resolveBrowsingMajor } from 'core/utils/godotMajorAvailability'

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

async function loadHomepageSnapshot (major: number | undefined): Promise<HomepageSnapshot> {
  // Fetch sections concurrently and degrade per-section instead of failing the
  // whole homepage when one query hiccups. Every listing query is filtered to
  // the pinned major BEFORE sorting/limiting so each section stays full. The
  // global denormalized category counts span every imported version, so pinned
  // views compute version-aware counts from the public catalog instead.
  const [trending, featured, lastModified, categories] = await Promise.allSettled([
    GetTrendingAssets(major),
    GetFourAssetsForHomepage(major),
    GetLastModifiedAssets(major),
    major === undefined
      ? GetAllCategoriesAndTheirAssetCount()
      : GetCategoryCountsByMajor(major)
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

    // The homepage leads with public discovery listings, all filtered to the
    // pinned Godot major. The snapshot cache is partitioned by major so a
    // 2.x/3.x/4.x/All visitor never receives another visitor's section data.
    // An explicit cookie choice is honored strictly; the implicit 4.x default
    // falls back to all when the catalog has no 4.x assets so the homepage
    // never renders empty.
    const major = await resolveBrowsingMajor(req.cookies[GODOT_VERSION_PREFERENCE_COOKIE])

    const cached = await cacheGetOrLoad(
      `gda:v2:homepage:${godotMajorCacheSuffix(major)}`,
      HOMEPAGE_CACHE_TTL_SECONDS,
      async () => await loadHomepageSnapshot(major),
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
        // Prefer the normalized modify_date_at (the authoritative ordering
        // field shared with search, the sitemap and JSON-LD); fall back to the
        // legacy string only for un-backfilled records.
        const raw = asset.modify_date_at ?? asset.modify_date
        const modified = raw instanceof Date ? raw : new Date(String(raw))
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
