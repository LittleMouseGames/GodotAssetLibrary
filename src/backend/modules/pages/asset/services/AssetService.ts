import { Request, Response } from 'express'
import { logger } from 'utility/logger'
import { GetAssetDisplayInformation } from '../models/GET/GetAssetDisplayInformation'
import { GetDoesPostExistById } from '../models/GET/GetDoesPostExistById'
import { GetHasUserReviewedAsset } from '../models/GET/GetHasUserReviewedAsset'
import { UpdatePositiveVotesAddOne } from '../models/UPDATE/UpdatePositiveVotesAddOne'
import { UpdateNegativeVotesAddOne } from '../models/UPDATE/UpdateNegativeVotesAddOne'
import { GetUserIdByToken } from 'modules/api/authentication/models/user/GET/GetUserIdByToken'
import { UpdateUserReviewedAssets } from '../models/UPDATE/UpdateUserReviewedAssets'
import { InsertReviewForAsset } from '../models/INSERT/InsertReviewForAsset'
import { GetAssetReviewsById } from '../models/GET/GetAssetReviewsById'
import { GetUsernameById } from 'modules/api/authentication/models/user/GET/GetUsernameById'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'
import { GetAssetReviewByUserId } from '../models/GET/GetAssetReviewByUserId'
import { UpdateNegativeVotesRemoveOne } from '../models/UPDATE/UpdateNegativeVotesRemoveOne'
import { UpdatePositiveVotesRemoveOne } from '../models/UPDATE/UpdatePositiveVotesRemoveOne'
import { UpdateReviewForAsset } from '../models/UPDATE/UpdateReviewForAsset'
import fromNow from 'fromnow'
import striptags from 'striptags'
import { GetUserSavedAssets } from 'modules/pages/dashboard/models/GET/GetUserSavedAssets'

export class AssetService {
  /**
   * Render asset page
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  public async render (req: Request, res: Response): Promise<any> {
    const assetId = req.params.id ?? ''
    const authToken = req.cookies['auth-token'] ?? ''

    if (assetId === '') {
      throw new Error('Missing asset ID')
    }

    try {
      const assetInfo = await GetAssetDisplayInformation(assetId)
      const comments = await GetAssetReviewsById(assetId)
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

      const pageBanner = {
        title: assetInfo.title,
        info: `An asset by <strong>${assetInfo.author}</strong>`
      }

      return res.render('templates/pages/asset/view', { info: assetInfo, comments: comments, hasUserReviewedAsset: hasUserReviewedAsset, usersAssetReview: usersAssetReview, pageBanner: pageBanner })
    } catch (e) {
      logger.log('error', 'Failed to load asset page', ...[e])
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
    const rating = String(req.body.rating) ?? ''
    const authToken = req.body.hashedToken ?? ''
    const assetId = req.params.id ?? ''
    const review = req.body.asset_review ?? ''
    const headline = req.body.asset_review_headline ?? ''
    const hasUserReviewedAsset = await GetHasUserReviewedAsset(authToken, assetId)

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

    if (headline.length >= 3 && review.length < 5) {
      throw new Error('If you add a headline you need a review, too')
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

      await UpdateUserReviewedAssets(authToken, assetId)
      await InsertReviewForAsset(userId, username, assetId, rating, striptags(review), striptags(headline))
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

    res.send()
  }
}
