import { Request, Response } from 'express'
import { logger } from 'utility/logger'
import { GetAssetDisplayInformation } from '../models/GET/GetAssetDisplayInformation'
import fromNow from 'fromnow'
import striptags from 'striptags'
import { GetDoesPostExistById } from '../models/GET/GetDoesPostExistById'
import { GetHasUserReviewedAsset } from '../models/GET/GetHasUserReviewedAsset'
import { UpdatePositiveVotesAddOne } from '../models/UPDATE/UpdatePositiveVotesAddOne'
import { UpdateNegativeVotesAddOne } from '../models/UPDATE/UpdateNegativeVotesAddOne'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { UpdateUserReviewedAssets } from '../models/UPDATE/UpdateUserReviewdAssets'
import { InsertCommentForAsset } from '../models/INSERT/InsertCommentForAsset'

export class AssetService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public async render (req: Request, res: Response): Promise<any> {
    try {
      const assetInfo = await GetAssetDisplayInformation(req.params.id)
      assetInfo.modify_date_pretty = fromNow(new Date(assetInfo.modify_date), {
        suffix: true,
        zero: false,
        max: 1
      })
      return res.render('templates/pages/asset/view', { info: assetInfo })
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

    if (assetId === '') {
      throw new Error('Missing post ID')
    }

    if (authToken === undefined || authToken === '') {
      throw new Error('Missing auth token. Are you logged in?')
    }

    if (await GetHasUserReviewedAsset(authToken, assetId)) {
      throw new Error('Looks like you\'ve arleady reviewed this asset')
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

    if (!(await GetDoesPostExistById(assetId))) {
      throw new Error('Asset not found')
    }

    const userId = await GetUserByToken(authToken)

    if (rating === 'positive') {
      await UpdatePositiveVotesAddOne(assetId)
    } else {
      await UpdateNegativeVotesAddOne(assetId)
    }

    await UpdateUserReviewedAssets(authToken, assetId)
    await InsertCommentForAsset(userId, assetId, rating, striptags(review), striptags(headline))

    res.send()
  }
}
