import { Request, Response } from 'express'
import { logger } from 'utility/logger'
import { GetAssetDisplayInformation } from '../models/GET/GetAssetDisplayInformation'
import fromNow from 'fromnow'
import striptags from 'striptags'

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
    let review = req.body.asset_review ?? ''

    if (rating === '' || (rating !== 'positive' && rating !== 'negative')) {
      throw new Error('Missing or invalid rating selection, expected "positive" or "negative"')
    }

    if (review.length > 500) {
      throw new Error('Review text is too long, must be less than 500 characters')
    }

    if (review.length < 5) {
      throw new Error('Rating too short, must be at least 5 characters')
    }

    review = striptags(review)

    res.send()
  }
}
