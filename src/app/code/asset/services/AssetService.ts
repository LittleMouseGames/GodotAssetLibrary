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
import { BadRequestError } from 'core/utils/httpError'
import { attachCardExtras } from 'core/utils/cardView'

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
      const assetInfo = await GetAssetDisplayInformation(assetId)

      if (assetInfo === null) {
        return res.status(StatusCodes.NOT_FOUND).render('templates/pages/lost/not-found', {
          pageBanner: {
            title: 'Asset not found',
            info: 'We couldn\'t find an asset with that ID'
          }
        })
      }

      // Imported asset data is untrusted. Only http(s) URLs may be rendered as
      // links, otherwise non-HTTP schemes (javascript:, data:, ...) would reach
      // the browser through the download/repository/issues controls.
      for (const field of ['download_url', 'browse_url', 'issues_url'] as const) {
        if (!isSafeHttpUrl(assetInfo[field])) assetInfo[field] = ''
      }

      const REVIEWS_PER_PAGE = 10
      const parsedReviewsPage = Number.parseInt(striptags(String(req.query.reviews_page ?? '')), 10)
      const reviewsPage = Number.isNaN(parsedReviewsPage)
        ? 0
        : Math.max(0, Math.min(100, parsedReviewsPage))

      const comments = await GetAssetReviewsById(assetId, REVIEWS_PER_PAGE, reviewsPage * REVIEWS_PER_PAGE)
      let hasUserReviewedAsset = false
      let usersAssetReview = {}

      let reviewCount = comments.length
      let relatedAssets: Awaited<ReturnType<typeof GetRelatedAssets>> = []

      try {
        reviewCount = await GetAssetReviewCount(assetId)
      } catch (e) {
        // ignore
      }

      try {
        relatedAssets = await GetRelatedAssets(
          assetInfo.category,
          assetInfo.godot_version,
          assetInfo.type,
          assetInfo.asset_id
        )
      } catch (e) {
        // ignore
      }
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
            url: assetInfo.category_lowercase != null ? `/category/${assetInfo.category_lowercase}` : ''
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
        noindex: assetInfo.source_status === 'unavailable',
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
