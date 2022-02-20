import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { DashboardService } from '../services/DashboardService'
import rateLimit from 'express-rate-limit'
import { CheckIfUserExistAndSendError } from 'utility/middleware/CheckIfUserExistAndSendError'

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

@Controller('dashboard')
export class DashboardController {
  private readonly DashboardService: DashboardService = new DashboardService()

  @Get('/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async index (req: Request, res: Response): Promise<void> {
    try {
      return await this.DashboardService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('reviews/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async reviews (req: Request, res: Response): Promise<void> {
    try {
      return await this.DashboardService.renderReviews(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('saved/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async saved (req: Request, res: Response): Promise<void> {
    try {
      return await this.DashboardService.renderSaved(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
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

  @Get('save/:id')
  @Middleware([CheckIfUserExistAndSendError('Unable to save, are you logged in?')])
  private async saveAsset (req: Request, res: Response): Promise<void> {
    try {
      return await this.DashboardService.saveAsset(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
