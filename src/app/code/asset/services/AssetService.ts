import { Request, Response } from 'express'
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
import DOMPurify from 'dompurify'
import fromNow from 'fromnow'
import striptags from 'striptags'
import { marked } from 'marked'
import { JSDOM } from 'jsdom'

export class AssetService {
  /**
   * Render asset page
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  public render = async (req: Request, res: Response): Promise<any> => {
    const assetId = striptags(req.params.id ?? '')
    const authToken = striptags(req.cookies['auth-token'] ?? '')

    logger.log('info', `Rendering asset page ${assetId}`)

    if (assetId === '') {
      throw new Error('Missing asset ID')
    }

    try {
      const [
        assetInfo,
        comments
      ] = await Promise.all([
        GetAssetDisplayInformation(assetId),
        GetAssetReviewsById(assetId)
      ])

      let hasUserReviewedAsset = false
      let usersAssetReview = {}

      assetInfo.modify_date_pretty = fromNow(new Date(assetInfo.modify_date), {
        suffix: true,
        zero: false,
        max: 1
      })

      if (authToken !== '') {
        const tokenServices = TokenServices.getInstance()
        const hashedToken = tokenServices.hashToken(authToken)
        try {
          const userId = await GetUserIdByToken(hashedToken);

          [
            hasUserReviewedAsset,
            usersAssetReview
          ] = await Promise.all([
            GetHasUserReviewedAsset(hashedToken, assetId),
            GetAssetReviewByUserId(assetId, userId)
          ])
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

      if ('readme' in assetInfo) {
        const window = new JSDOM('<!DOCTYPE html>').window
        // @ts-expect-error
        const purify = DOMPurify(window)

        let branch = 'master'

        if (assetInfo.icon_url.includes('/main/')) {
          branch = 'main'
        }

        // Override function
        const renderer = {
          image (href: string, title: string, text: string) {
            if (assetInfo.browse_url.includes('gitlab.com') && !href.includes('gitlab.com') && !href.includes('http')) {
              href = `${assetInfo.browse_url}/-/raw/${branch}/${href}`
            }

            if (assetInfo.browse_url.includes('github.com') && !href.includes('github.com') && !href.includes('http')) {
              href = `${assetInfo.browse_url}/raw/${branch}/${href}`
            }

            return `
            <img src="${href}" alt="README ${title ?? text}" />
            `
          },
          html (html: string) {
            if (html.includes('<img')) {
              if (assetInfo.browse_url.includes('gitlab.com')) {
                html = html.replace(/<img/g, `<img data-host="${assetInfo.browse_url}/-/raw/${branch}/"`)
              }

              if (assetInfo.browse_url.includes('github.com')) {
                html = html.replace(/<img/g, `<img data-host="${assetInfo.browse_url}/raw/${branch}/"`)
              }
            }

            return html
          }
        }

        marked.use({ renderer })

        const clean = purify.sanitize(marked.parse(assetInfo.readme))

        assetInfo.readme = clean
      }

      const pageBanner = {
        title: assetInfo.title,
        info: `An asset by <strong>${assetInfo.author}</strong>`
      }

      return res.render('templates/pages/asset/view', {
        info: assetInfo,
        comments: comments,
        hasUserReviewedAsset: hasUserReviewedAsset,
        usersAssetReview: usersAssetReview,
        pageBanner: pageBanner
      })
    } catch (e: any) {
      logger.log('error', `Failed to load asset page: ${assetId}, ${e?.message}`, [e])
      return res.send({ error: 'Sorry, we\'re having issues loading this page right now' })
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

    const [hasUserReviewedAsset, isAccountDisabled] = await Promise.all([
      GetHasUserReviewedAsset(authToken, assetId),
      GetIsAccountDisabledByToken(authToken)
    ])

    let siteRestrictions: any = {}

    try {
      siteRestrictions = await GetSiteRestrictions()
    } catch (e) {
      // ignore
    }

    if (siteRestrictions?.disable_new_comments === true || isAccountDisabled) {
      throw new Error('Posting new reviews has been temporarily disabled')
    }

    if (assetId === '') {
      throw new Error('Missing post ID')
    }

    if (authToken === undefined || authToken === '') {
      throw new Error('Missing auth token. Are you logged in?')
    }

    if (rating === '' || (rating !== 'positive' && rating !== 'negative')) {
      throw new Error('Missing or invalid rating selection, expected "positive" or "negative"')
    }

    if (review.length > 500) {
      throw new Error('Review text is too long, must be less than 500 characters')
    }

    if (review.length > 0 && review.length < 5) {
      throw new Error('Review text too short, must be at least 5 characters')
    }

    if (headline.length > 50) {
      throw new Error('Headline text is too long, must be less than 50 characters')
    }

    if (headline.length > 0 && headline.length < 3) {
      throw new Error('Headline too short, must be at least 3 characters')
    }

    if (review.length > 5 && headline.length < 3) {
      throw new Error('If you add a review you need a headline, too')
    }

    if (!(await GetDoesPostExistById(assetId))) {
      throw new Error('Asset not found')
    }

    const userId = await GetUserIdByToken(authToken)
    const username = await GetUsernameById(userId)

    if (!hasUserReviewedAsset) {
      if (rating === 'positive') {
        await UpdatePositiveVotesAddOne(assetId)
      } else {
        await UpdateNegativeVotesAddOne(assetId)
      }

      await Promise.all([
        UpdateUserReviewedAssets(authToken, assetId),
        InsertReviewForAsset(userId, username, assetId, rating, striptags(review), striptags(headline))
      ])
    } else {
      const oldReview = await GetAssetReviewByUserId(assetId, userId)

      if (oldReview.review_type === 'positive' && rating === 'negative') {
        await Promise.all([
          UpdateNegativeVotesAddOne(assetId),
          UpdatePositiveVotesRemoveOne(assetId)
        ])
      } else if (oldReview.review_type === 'negative' && rating === 'positive') {
        await Promise.all([
          UpdatePositiveVotesAddOne(assetId),
          UpdateNegativeVotesRemoveOne(assetId)

        ])
      }

      await UpdateReviewForAsset(userId, assetId, rating, striptags(review), striptags(headline))
    }

    res.send()
  }

  public async reportReview (req: Request, res: Response): Promise<void> {
    const reasons = [
      'spam',
      'harrasement',
      'illegal',
      'other'
    ]

    const reason = striptags(req.body.reason)
    const notes = striptags(req.body.notes ?? '')
    const reviewId = striptags(req.params.id ?? '')
    const authToken = striptags(req.cookies['auth-token'] ?? '')

    if (reviewId.length === 0) {
      throw new Error('Missing comment ID')
    }

    if (notes.length > 200) {
      throw new Error('Notes too long, please keep it under 500 characters')
    }

    if (reason === undefined || !reasons.includes(reason)) {
      throw new Error('Invalid or missing reason')
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
