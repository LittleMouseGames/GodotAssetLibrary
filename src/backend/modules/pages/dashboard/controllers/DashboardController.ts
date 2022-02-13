import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
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

  /**
   * Home
   */
  @Post('update/info')
  @Middleware(CheckIfUserExistAndRedirect('/register', false))
  private async updateInformation (req: Request, res: Response): Promise<void> {
    try {
      return await this.DashboardService.updateInfo(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
