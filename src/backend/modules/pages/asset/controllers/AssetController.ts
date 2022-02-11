import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
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
}
