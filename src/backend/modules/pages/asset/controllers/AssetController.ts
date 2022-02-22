import { Controller, Get, Middleware, Post, Patch } from '@overnightjs/core'
import { Request, Response } from 'express'
import { CheckIfUserExistAndSendError } from 'utility/middleware/CheckIfUserExistAndSendError'
import { AssetService } from '../services/AssetService'

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
  @Middleware([CheckIfUserExistAndSendError()])
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
  @Middleware([CheckIfUserExistAndSendError()])
  private async updateReview (req: Request, res: Response): Promise<any> {
    return await this.AssetService.review(req, res)
  }
}
