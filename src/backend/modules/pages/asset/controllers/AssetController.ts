import { Controller, Get, Middleware, Post, Patch } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
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
    try {
      return await this.AssetService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
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
    try {
      return await this.AssetService.review(req, res)
    } catch (e: any) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
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
    try {
      return await this.AssetService.review(req, res)
    } catch (e: any) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
