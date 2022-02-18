import { Request, Response } from 'express'
import { logger } from 'utility/logger'
import { GetAssetDisplayInformation } from '../models/GET/GetAssetDisplayInformation'
import striptags from 'striptags'
import { GetDoesPostExistById } from '../models/GET/GetDoesPostExistById'
import { GetHasUserReviewedAsset } from '../models/GET/GetHasUserReviewedAsset'
import { UpdatePositiveVotesAddOne } from '../models/UPDATE/UpdatePositiveVotesAddOne'
import { UpdateNegativeVotesAddOne } from '../models/UPDATE/UpdateNegativeVotesAddOne'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { UpdateUserReviewedAssets } from '../models/UPDATE/UpdateUserReviewdAssets'
import { InsertCommentForAsset } from '../models/INSERT/InsertCommentForAsset'
import { GetAssetCommentsById } from '../models/GET/GetAssetCommentsById'
import { GetUsernameById } from 'modules/api/authentication/models/user/GET/GetUsernameById'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'
import { GetAssetCommentByUserId } from '../models/GET/GetAssetCommentByUserId'
import { UpdateNegativeVotesRemoveOne } from '../models/UPDATE/UpdateNegativeVotesRemoveOne'
import { UpdatePositiveVotesRemoveOne } from '../models/UPDATE/UpdatePositiveVotesRemoveOne'
import { UpdateCommentForAsset } from '../models/UPDATE/UpdateCommentForAsset'
import fromNow from 'fromnow'

export class AssetService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public async render (req: Request, res: Response): Promise<any> {
    const assetId = req.params.id ?? ''
    const authToken = req.cookies['auth-token'] ?? ''

    if (assetId === '') {
      throw new Error('Missing asset ID')
    }

    try {
      const assetInfo = await GetAssetDisplayInformation(assetId)
      const comments = await GetAssetCommentsById(assetId)
      let hasUserReviewedAsset = false
      let usersAssetComment = {}

      assetInfo.modify_date_pretty = fromNow(new Date(assetInfo.modify_date), {
        suffix: true,
        zero: false,
        max: 1
      })

      if (authToken !== '') {
        const tokenServices = TokenServices.getInstance()
        const hashedToken = tokenServices.hashToken(authToken)
        try {
          const userId = await GetUserByToken(hashedToken)
          hasUserReviewedAsset = await GetHasUserReviewedAsset(hashedToken, assetId)
          usersAssetComment = await GetAssetCommentByUserId(assetId, userId)
        } catch (e) {
          // ignore
        }
      }

      return res.render('templates/pages/asset/view', { info: assetInfo, comments: comments, hasUserReviewedAsset: hasUserReviewedAsset, usersAssetComment: usersAssetComment })
    } catch (e) {
      logger.log('error', 'Failed to load asset page', ...[e])
      return res.send({ error: 'Sorry, we\'re having issues loading this page right now' })
    }
  }

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

    if (headline.length > 100) {
      throw new Error('Headline text is too long, must be less than 100 characters')
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

    const userId = await GetUserByToken(authToken)
    const username = await GetUsernameById(userId)

    if (!hasUserReviewedAsset) {
      if (rating === 'positive') {
        await UpdatePositiveVotesAddOne(assetId)
      } else {
        await UpdateNegativeVotesAddOne(assetId)
      }

      await UpdateUserReviewedAssets(authToken, assetId)
      await InsertCommentForAsset(userId, username, assetId, rating, striptags(review), striptags(headline))
    } else {
      const oldComment = await GetAssetCommentByUserId(assetId, userId)

      if (oldComment.review_type === 'positive' && rating === 'negative') {
        await UpdateNegativeVotesAddOne(assetId)
        await UpdatePositiveVotesRemoveOne(assetId)
      } else if (oldComment.review_type === 'negative' && rating === 'positive') {
        await UpdatePositiveVotesAddOne(assetId)
        await UpdateNegativeVotesRemoveOne(assetId)
      }

      await UpdateCommentForAsset(userId, assetId, rating, striptags(review), striptags(headline), new Date())
    }

    res.send()
  }
}
