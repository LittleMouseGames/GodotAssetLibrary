import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { logger } from 'core/utils/logger'
import { GetAssetDisplayInformation } from '../models/GET/GetAssetDisplayInformation'
import { GetDoesPostExistById } from '../models/GET/GetDoesPostExistById'
import { GetHasUserReviewedAsset } from '../models/GET/GetHasUserReviewedAsset'
import { UpdatePositiveVotesAddOne } from '../models/UPDATE/UpdatePositiveVotesAddOne'
import { UpdateNegativeVotesAddOne } from '../models/UPDATE/UpdateNegativeVotesAddOne'
import { GetUserIdByToken } from 'core/modules/authentication/models/user/GET/GetUserIdByToken'
import { UpdateUserReviewedAssets } from '../models/UPDATE/UpdateUserReviewedAssets'
import { InsertReviewForAsset } from '../models/INSERT/InsertReviewForAsset'
import { GetAssetReviewsById } from '../models/GET/GetAssetReviewsById'
import { GetUsernameById } from 'core/modules/authentication/models/user/GET/GetUsernameById'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetAssetReviewByUserId } from '../models/GET/GetAssetReviewByUserId'
import { UpdateNegativeVotesRemoveOne } from '../models/UPDATE/UpdateNegativeVotesRemoveOne'
import { UpdatePositiveVotesRemoveOne } from '../models/UPDATE/UpdatePositiveVotesRemoveOne'
import { UpdateReviewForAsset } from '../models/UPDATE/UpdateReviewForAsset'
import { GetUserSavedAssets } from 'app/code/dashboard/models/GET/GetUserSavedAssets'
import { GetSiteRestrictions } from 'app/code/admin/models/GET/GetSiteRestrictions'
import { GetIsAccountDisabledByToken } from '../models/GET/GetIsAccountDisabledByToken'
import { InsertReviewReport } from '../models/INSERT/InsertReviewReport'
import { GetRelatedAssets } from '../models/GET/GetRelatedAssets'
import { GetAssetReviewCount } from '../models/GET/GetAssetReviewCount'
import { RefreshAssetRating } from '../models/UPDATE/RefreshAssetRating'
import fromNow from 'fromnow'
import striptags from 'striptags'
import { getFallbackImage, normalizePreviews } from 'core/utils/mediaHelpers'
import { renderReadme } from 'core/utils/readmeRenderer'
import { isSafeHttpUrl } from 'core/utils/safeUrl'
import { escapeHtml } from 'core/utils/escapeHtml'
import { buildAssetUrl } from 'core/utils/assetUrl'
import { buildCategoryPath } from 'core/utils/taxonomyUrl'
import { BadRequestError } from 'core/utils/httpError'
import { attachCardExtras } from 'core/utils/cardView'
import { buildAllAssetCacheKeys, buildAssetCacheKey, cacheDelete, cacheGetOrLoad } from 'core/utils/dragonfly'
import { GODOT_VERSION_PREFERENCE_COOKIE } from 'core/utils/godotVersionPreference'
import { resolveBrowsingMajor } from 'core/utils/godotMajorAvailability'

const REVIEWS_PER_PAGE = 10

const parsedAssetTtl = Number.parseInt(process.env.CACHE_ASSET_TTL_SECONDS ?? '', 10)
const ASSET_CACHE_TTL_SECONDS = Number.isFinite(parsedAssetTtl) && parsedAssetTtl > 0
  ? parsedAssetTtl
  : 30

interface AssetPageData {
  assetInfo: Awaited<ReturnType<typeof GetAssetDisplayInformation>>
  comments: Awaited<ReturnType<typeof GetAssetReviewsById>>
  reviewCount: number
  relatedAssets: Awaited<ReturnType<typeof GetRelatedAssets>>
}

/**
 * Load the shared data behind a public asset page: the asset document, the
 * requested page of reviews, the persisted review count and related assets.
 * The four MongoDB operations are consolidated so a Dragonfly cache hit serves
 * the whole page from memory. Mutations that change any of these (reviews,
 * admin review deletion) invalidate the cache keys.
 *
 * `major` is the visitor's pinned Godot major and constrains the related-asset
 * cards bundled into the cached page.
 */
async function loadAssetPageData (assetId: string, reviewsPage = 0, major?: number): Promise<AssetPageData> {
  const assetInfo = await GetAssetDisplayInformation(assetId)

  if (assetInfo === null) {
    return { assetInfo: null, comments: [], reviewCount: 0, relatedAssets: [] }
  }

  // Imported asset data is untrusted. Only http(s) URLs may be rendered as
  // links, otherwise non-HTTP schemes (javascript:, data:, ...) would reach
  // the browser through the download/repository/issues controls. Sanitizing
  // here (instead of per request) keeps the cached copy safe too.
  for (const field of ['download_url', 'browse_url', 'issues_url'] as const) {
    if (!isSafeHttpUrl(assetInfo[field])) assetInfo[field] = ''
  }

  const [commentsResult, reviewCountResult, relatedAssetsResult] = await Promise.allSettled([
    GetAssetReviewsById(assetId, REVIEWS_PER_PAGE, reviewsPage * REVIEWS_PER_PAGE),
    GetAssetReviewCount(assetId),
    GetRelatedAssets(assetInfo.category, assetInfo.godot_version, assetInfo.type, assetInfo.asset_id, major)
  ])

  return {
    assetInfo,
    comments: commentsResult.status === 'fulfilled' ? commentsResult.value : [],
    reviewCount: reviewCountResult.status === 'fulfilled'
      ? reviewCountResult.value
      : (commentsResult.status === 'fulfilled' ? commentsResult.value.length : 0),
    relatedAssets: relatedAssetsResult.status === 'fulfilled' ? relatedAssetsResult.value : []
  }
}

export class AssetService {
  /**
   * Render asset page
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  public async render (req: Request, res: Response): Promise<any> {
    const assetId = striptags(req.params.id ?? '')
    const authToken = striptags(req.cookies['auth-token'] ?? '')

    // "Back to results" must stay local to discovery routes to avoid open redirects.
    const fromParam = striptags(String(req.query.from ?? ''))
    const VALID_BACK_PREFIXES = ['/search/', '/category/', '/engine/']
    const isSafeBackLink = VALID_BACK_PREFIXES.some(prefix => fromParam.startsWith(prefix)) &&
      !fromParam.includes('://') &&
      !fromParam.includes('..')
    const backToResults = isSafeBackLink ? fromParam : ''

    if (assetId === '') {
      throw new Error('Missing asset ID')
    }

    try {
      const parsedReviewsPage = Number.parseInt(striptags(String(req.query.reviews_page ?? '')), 10)
      const reviewsPage = Number.isNaN(parsedReviewsPage)
        ? 0
        : Math.max(0, Math.min(100, parsedReviewsPage))

      // Related cards bundled into the anonymous cached page follow the
      // visitor's pinned major (asset pages have no exact engine selection).
      const relatedMajor = await resolveBrowsingMajor(req.cookies[GODOT_VERSION_PREFERENCE_COOKIE])

      // The public asset page is expensive (~4 Mongo ops). Cache the shared
      // anonymous default view (page 0) in Dragonfly; authenticated requests,
      // paginated review views and a shared-cache outage fall back to a direct
      // load. Entries are invalidated after review/admin writes so fresh
      // reviews and ratings appear immediately.
      const cacheable = authToken === '' && reviewsPage === 0
      let bundle: AssetPageData
      if (cacheable) {
        const cached = await cacheGetOrLoad<AssetPageData>(
          buildAssetCacheKey(assetId, relatedMajor),
          ASSET_CACHE_TTL_SECONDS,
          async () => await loadAssetPageData(assetId, 0, relatedMajor),
          10_000
        )
        // Defensive clone so per-request mutations (saved state, card extras,
        // readme render) never leak into the shared cache entry.
        bundle = JSON.parse(JSON.stringify(cached.value)) as AssetPageData
      } else {
        // Paginated or authenticated views bypass the cache and must load the
        // requested reviews page (the cached bundle is always page 0).
        bundle = await loadAssetPageData(assetId, reviewsPage, relatedMajor)
      }
      const { assetInfo, comments, reviewCount, relatedAssets } = bundle

      if (assetInfo === null) {
        return res.status(StatusCodes.NOT_FOUND).render('templates/pages/lost/not-found', {
          pageBanner: {
            title: 'Asset not found',
            info: 'We couldn\'t find an asset with that ID'
          }
        })
      }

      // Consolidate duplicate URLs onto the canonical slug. Old slugs, encoded
      // punctuation, and id-only URLs all 301 to buildAssetUrl()'s slug so
      // link equity is not split across URL spellings. Discovery-context and
      // review pagination params are preserved.
      const canonicalUrl = buildAssetUrl(assetId, assetInfo.title)
      const requestedSlug = striptags(String(req.params[0] ?? ''))
      const requestedUrl = `/asset/${assetId}${requestedSlug !== '' ? `/${requestedSlug}` : ''}`
      if (requestedUrl !== canonicalUrl) {
        const redirectQuery = new URLSearchParams()
        if (backToResults !== '') redirectQuery.set('from', backToResults)
        const redirectTarget = canonicalUrl +
          (redirectQuery.toString() !== '' ? `?${redirectQuery.toString()}` : '')
        return res.redirect(StatusCodes.MOVED_PERMANENTLY, redirectTarget)
      }

      // URLs were sanitized inside loadAssetPageData (shared by cache and
      // fresh paths), so nothing else needs cleaning here.

      let hasUserReviewedAsset = false
      let usersAssetReview = {}
      attachCardExtras(relatedAssets)

      assetInfo.modify_date_pretty = fromNow(new Date(assetInfo.modify_date), {
        suffix: true,
        zero: false,
        max: 1
      })

      if (authToken !== '') {
        const tokenServices = TokenServices.getInstance()
        const hashedToken = tokenServices.hashToken(authToken)
        try {
          const userId = await GetUserIdByToken(hashedToken)
          hasUserReviewedAsset = await GetHasUserReviewedAsset(hashedToken, assetId)
          usersAssetReview = await GetAssetReviewByUserId(assetId, userId)
        } catch (e) {
          // ignore
        }

        try {
          const userSaved = await GetUserSavedAssets(hashedToken)

          assetInfo.saved = userSaved.includes(assetInfo.asset_id)
        } catch (e) {
          // ignore
        }
      }

      if (typeof assetInfo.readme === 'string' && assetInfo.readme !== '') {
        assetInfo.readme = renderReadme(assetInfo.readme, assetInfo)
      }

      const pageBanner = {
        title: assetInfo.title,
        info: `An asset by <strong>${escapeHtml(assetInfo.author)}</strong>`,
        backLink: backToResults !== ''
          ? { url: backToResults, label: 'Back to results', title: 'Back to previous results' }
          : null,
        breadcrumb: [
          { label: 'Home', url: '/' },
          {
            label: assetInfo.category ?? 'Assets',
            url: buildCategoryPath(assetInfo.category_lowercase ?? assetInfo.category)
          },
          { label: assetInfo.title ?? 'Asset', url: '' }
        ]
      }
      const mediaItems = normalizePreviews(assetInfo.previews)
      const galleryMedia = mediaItems.filter(item => item.type !== 'external')
      const fallbackImage = getFallbackImage(assetInfo)

      const reviewsHasMore = (reviewsPage * REVIEWS_PER_PAGE) + comments.length < reviewCount
      const reviewsNextPage = reviewsPage + 1
      const nextReviewsQuery = new URLSearchParams()
      nextReviewsQuery.set('reviews_page', String(reviewsNextPage))
      if (backToResults !== '') nextReviewsQuery.set('from', backToResults)

      return res.render('templates/pages/asset/view', {
        info: assetInfo,
        comments: comments,
        relatedAssets: relatedAssets,
        reviewCount: reviewCount,
        reviewsShown: comments.length,
        reviewsPage: reviewsPage,
        reviewsHasMore: reviewsHasMore,
        reviewsNextUrl: `${buildAssetUrl(assetId, assetInfo.title)}?${nextReviewsQuery.toString()}`,
        backToResults: backToResults,
        hasUserReviewedAsset: hasUserReviewedAsset,
        usersAssetReview: usersAssetReview,
        pageBanner: pageBanner,
        mediaItems: galleryMedia,
        primaryMedia: galleryMedia[0] ?? null,
        noindex: assetInfo.source_status === 'unavailable' || assetInfo.searchable === 'false',
        fallbackImage: fallbackImage
      })
    } catch (e: any) {
      logger.log('error', `Failed to load asset page: ${assetId}, ${e?.message}`, [e])
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('templates/pages/lost/server-error', {
        pageBanner: {
          title: 'Something went wrong',
          info: 'Sorry, we\'re having issues loading this page right now'
        }
      })
    }
  }

  /**
   * Add review to asset
   *
   * @param {Request} req
   * @param {Response} res
   */
  public async review (req: Request, res: Response): Promise<any> {
    const rating = striptags(req.body.rating ?? '')
    const authToken = striptags(req.body.hashedToken ?? '')
    const assetId = striptags(req.params.id ?? '')
    const review = striptags(req.body.asset_review ?? '')
    const headline = striptags(req.body.asset_review_headline ?? '')
    const hasUserReviewedAsset = await GetHasUserReviewedAsset(authToken, assetId)
    const isAccountDisabled = await GetIsAccountDisabledByToken(authToken)
    let siteRestrictions: any = {}

    try {
      siteRestrictions = await GetSiteRestrictions()
    } catch (e) {
      // ignore
    }

    if (siteRestrictions?.disable_new_comments === true || isAccountDisabled) {
      throw new BadRequestError('Posting new reviews has been temporarily disabled')
    }

    if (assetId === '') {
      throw new BadRequestError('Missing post ID')
    }

    if (authToken === undefined || authToken === '') {
      throw new BadRequestError('Missing auth token. Are you logged in?')
    }

    if (rating === '' || (rating !== 'positive' && rating !== 'negative')) {
      throw new BadRequestError('Missing or invalid rating selection, expected "positive" or "negative"')
    }

    if (review.length > 500) {
      throw new BadRequestError('Review text is too long, must be less than 500 characters')
    }

    if (review.length > 0 && review.length < 5) {
      throw new BadRequestError('Review text too short, must be at least 5 characters')
    }

    if (headline.length > 50) {
      throw new BadRequestError('Headline text is too long, must be less than 50 characters')
    }

    if (headline.length > 0 && headline.length < 3) {
      throw new BadRequestError('Headline too short, must be at least 3 characters')
    }

    // A review of exactly 5 characters is still a review and needs a headline.
    if (review.length >= 5 && headline.length < 3) {
      throw new BadRequestError('If you add a review you need a headline, too')
    }

    if (!(await GetDoesPostExistById(assetId))) {
      throw new BadRequestError('Asset not found')
    }

    const userId = await GetUserIdByToken(authToken)
    const username = await GetUsernameById(userId)

    if (!hasUserReviewedAsset) {
      if (rating === 'positive') {
        await UpdatePositiveVotesAddOne(assetId)
      } else {
        await UpdateNegativeVotesAddOne(assetId)
      }

      await UpdateUserReviewedAssets(authToken, assetId)
      try {
        await InsertReviewForAsset(userId, username, assetId, rating, striptags(review), striptags(headline))
      } catch (e: any) {
        // The unique (user_id, asset_id) index makes duplicate inserts
        // impossible. A concurrent request may have won the race, so treat
        // this as an update rather than surfacing a server error.
        await UpdateReviewForAsset(userId, assetId, rating, striptags(review), striptags(headline))
      }
    } else {
      const oldReview = await GetAssetReviewByUserId(assetId, userId)

      if (oldReview.review_type === 'positive' && rating === 'negative') {
        await UpdateNegativeVotesAddOne(assetId)
        await UpdatePositiveVotesRemoveOne(assetId)
      } else if (oldReview.review_type === 'negative' && rating === 'positive') {
        await UpdatePositiveVotesAddOne(assetId)
        await UpdateNegativeVotesRemoveOne(assetId)
      }

      await UpdateReviewForAsset(userId, assetId, rating, striptags(review), striptags(headline))
    }

    // Recompute counters from the canonical reviews so upvotes/downvotes and
    // the confidence-adjusted rating_score always match what cards display.
    await RefreshAssetRating(assetId)

    // The public asset page is cached briefly; drop every major variant so the
    // review and its rating change are reflected immediately.
    void cacheDelete(...buildAllAssetCacheKeys(assetId))

    res.send()
  }

  public async reportReview (req: Request, res: Response): Promise<void> {
    const reasons = [
      'spam',
      'harassment',
      'illegal',
      'other'
    ]

    const rawReason = striptags(req.body.reason)
    // Normalize the legacy misspelling so older clients keep working
    const reason = rawReason === 'harrasement' ? 'harassment' : rawReason
    const notes = striptags(req.body.notes ?? '')
    const reviewId = striptags(req.params.id ?? '')
    const authToken = striptags(req.cookies['auth-token'] ?? '')

    if (reviewId.length === 0) {
      throw new BadRequestError('Missing comment ID')
    }

    if (notes.length > 200) {
      throw new BadRequestError('Notes too long, please keep it under 200 characters')
    }

    if (reason === undefined || !reasons.includes(reason)) {
      throw new BadRequestError('Invalid or missing reason')
    }

    let userId = 'not-logged-in'

    if (authToken.length > 0) {
      const tokenServices = TokenServices.getInstance()
      const hashedToken = tokenServices.hashToken(authToken)

      try {
        userId = await GetUserIdByToken(hashedToken)
      } catch (e) {
        // ignore
      }
    }

    void await InsertReviewReport(userId, reason, notes, reviewId)

    res.send('Review report sent successfully')
  }
}
