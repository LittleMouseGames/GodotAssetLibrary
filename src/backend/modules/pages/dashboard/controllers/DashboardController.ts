import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'

import { DashboardService } from '../services/DashboardService'

/**
 * The user controller
 */
@Controller('dashboard')
export class DashboardController {
  private readonly DashboardService: DashboardService = new DashboardService()

  /**
   * Home
   */
  @Get('/')
  private async index (req: Request, res: Response): Promise<void> {
    return this.DashboardService.render(req, res)
  }
}
