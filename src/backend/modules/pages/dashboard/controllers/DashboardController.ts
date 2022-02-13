import { Controller, Get, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'

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
  @Middleware(CheckIfUserExistAndRedirect('/register', false))
  private async index (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.render(req, res)
  }
}
