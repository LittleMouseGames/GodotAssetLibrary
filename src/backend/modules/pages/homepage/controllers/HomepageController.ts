import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'

import { HomepageService } from '../services/HomepageService'

/**
 * The user controller
 */
@Controller('/')
export class HomepageController {
  private readonly HomepageService: HomepageService = new HomepageService()

  /**
   * Home
   */
  @Get('/')
  private async index (req: Request, res: Response): Promise<void> {
    return await this.HomepageService.render(req, res)
  }
}
