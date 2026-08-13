import { Controller, Get, Middleware, Post, Patch } from '@overnightjs/core'
import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import rateLimit from 'express-rate-limit'
import { CheckIfUserExistAndSendError } from 'core/modules/authentication/middleware/CheckIfUserExistAndSendError'
import { rateLimitHandler } from 'core/utils/rateLimitHandler'
import { buildAssetUrl } from 'core/utils/assetUrl'
import { GetAssetDisplayInformation } from '../models/GET/GetAssetDisplayInformation'
import striptags from 'striptags'
import { AssetService } from '../services/AssetService'

const reviewAssetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too often, please try again later' })
})

const updateReviewRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too often, please try again later' })
})

const reportReviewRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

const renderAssetRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 60, // start blocking after x requests
  handler: rateLimitHandler('You\'re doing that too often, please try again later')
})

@Controller('asset')
export class AssetController {
  private readonly AssetService: AssetService = new AssetService()

  /**
   * Asset landing page
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  @Get(':id/*')
  @Middleware(renderAssetRateLimit)
  private async index (req: Request, res: Response, next: NextFunction): Promise<void> {
    return await this.AssetService.render(req, res, next)
  }

  /**
   * Id-only asset URLs (`/asset/:id`) never match `:id/*`; resolve the asset
   * and permanently redirect to the canonical slug so link equity and the
   * sitemap always point at one URL per asset.
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  @Get(':id')
  @Middleware(renderAssetRateLimit)
  private async indexByIdOnly (req: Request, res: Response): Promise<void> {
    const assetId = striptags(req.params.id ?? '')
    const fromParam = striptags(String(req.query.from ?? ''))
    const isValidBackLink = /^\/(search|category|engine)\//.test(fromParam) &&
      !fromParam.includes('://') && !fromParam.includes('..')

    const assetInfo = await GetAssetDisplayInformation(assetId)
    if (assetInfo === null) {
      res.set('Cache-Control', 'no-store')
      res.set('X-Robots-Tag', 'noindex, nofollow')
      return res.status(StatusCodes.NOT_FOUND).render('templates/pages/lost/not-found', {
        pageBanner: {
          title: 'Asset not found',
          info: 'We couldn\'t find an asset with that ID'
        }
      })
    }

    // Linked siblings (non-root variants) always resolve to the canonical
    // project URL, so old/direct ids never 301 to a redirecting page.
    const canonicalId = assetInfo.group_id ?? assetId
    const canonicalUrl = buildAssetUrl(canonicalId, assetInfo.title)
    const query = new URLSearchParams()
    if (isValidBackLink) query.set('from', fromParam)
    const target = canonicalUrl + (query.toString() !== '' ? `?${query.toString()}` : '')
    return res.redirect(StatusCodes.MOVED_PERMANENTLY, target)
  }

  /**
   * Post comment to asset
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  @Post('review/:id')
  @Middleware([reviewAssetRateLimit, CheckIfUserExistAndSendError()])
  private async review (req: Request, res: Response): Promise<any> {
    return await this.AssetService.review(req, res)
  }

  /**
   * Update comment to for asset
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  @Patch('review/:id')
  @Middleware([updateReviewRateLimit, CheckIfUserExistAndSendError()])
  private async updateReview (req: Request, res: Response): Promise<any> {
    return await this.AssetService.review(req, res)
  }

  @Post('report/review/:id')
  @Middleware(reportReviewRateLimit)
  private async reportReview (req: Request, res: Response): Promise<any> {
    return await this.AssetService.reportReview(req, res)
  }
}
