import { Controller, Get, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { AssetService } from '../services/AssetService'

/**
 * The user controller
 */
@Controller('asset')
export class AssetController {
  private readonly AssetService: AssetService = new AssetService()

  /**
   * Home
   */
  @Get(':id/*')
  private async index (req: Request, res: Response): Promise<void> {
    return await this.AssetService.render(req, res)
  }

  @Post('review/:id')
  private async review (req: Request, res: Response): Promise<any> {
    try {
      return await this.AssetService.review(req, res)
    } catch (e: any) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
