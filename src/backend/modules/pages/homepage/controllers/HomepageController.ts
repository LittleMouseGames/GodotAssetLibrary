import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'

import { HomepageService } from '../services/HomepageService'

/**
 * The user controller
 */
@Controller('/')
export class HomepageController {
  private readonly HomepageService: HomepageService

  public constructor () {
    this.HomepageService = new HomepageService()
  }

  /**
   * Home
   */
  @Get('/')
  private index (req: Request, res: Response): void {
    return this.HomepageService.render(req, res)
  }
}
