import { Controller, Get, Middleware, Post, Patch } from '@overnightjs/core'
import { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { CheckIfUserExistAndSendError } from 'utility/middleware/CheckIfUserExistAndSendError'
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
  max: 30, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too often, please try again later' })
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
  private async index (req: Request, res: Response): Promise<void> {
    return await this.AssetService.render(req, res)
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
