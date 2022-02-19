import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { DashboardService } from '../services/DashboardService'
import rateLimit from 'express-rate-limit'

const updateInfoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 7, // start blocking after 5 requests
  message: JSON.stringify({ error: 'Too many account changes in time period, please try again later' })
})

const updatePasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 7, // start blocking after 5 requests
  message: JSON.stringify({ error: 'Too many password changes in time period, please try again later' })
})

/**
 * The user controller
 */
@Controller('dashboard')
export class DashboardController {
  private readonly DashboardService: DashboardService = new DashboardService()

  @Get('/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async index (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.render(req, res)
  }

  @Get('reviews/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async reviews (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.renderReviews(req, res)
  }

  @Post('update/info')
  @Middleware([updateInfoRateLimit, CheckIfUserExistAndRedirect('/register', false)])
  private async updateInformation (req: Request, res: Response): Promise<void> {
    try {
      return await this.DashboardService.updateInfo(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Post('update/password')
  @Middleware([updatePasswordRateLimit, CheckIfUserExistAndRedirect('/register', false)])
  private async updatePassword (req: Request, res: Response): Promise<void> {
    try {
      return await this.DashboardService.updatePassword(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
