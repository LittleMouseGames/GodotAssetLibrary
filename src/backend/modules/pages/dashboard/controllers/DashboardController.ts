import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { DashboardService } from '../services/DashboardService'
import rateLimit from 'express-rate-limit'
import { CheckIfUserExistAndSendError } from 'utility/middleware/CheckIfUserExistAndSendError'

const updateInfoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // start blocking after x requests
  message: JSON.stringify({ error: 'Too many account changes in time period, please try again later' })
})

const updatePasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // start blocking after x requests
  message: JSON.stringify({ error: 'Too many password changes in time period, please try again later' })
})

const downloadInfoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 2, // start blocking after x requests
  message: JSON.stringify({ error: 'Too many requests, please try again later' })
})

const deleteAccountRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 1, // start blocking after x requests
  message: JSON.stringify({ error: 'Too many requests, please try again later' })
})

const saveAssetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 100, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

const viewSavedAndReviewedRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 30, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

@Controller('dashboard')
export class DashboardController {
  private readonly DashboardService: DashboardService = new DashboardService()

  @Get('/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async index (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.render(req, res)
  }

  @Get('reviews/')
  @Middleware([viewSavedAndReviewedRateLimit, CheckIfUserExistAndRedirect('/register', false)])
  private async reviews (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.renderReviews(req, res)
  }

  @Get('manage/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async manage (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.renderManage(req, res)
  }

  @Get('saved/')
  @Middleware([viewSavedAndReviewedRateLimit, CheckIfUserExistAndRedirect('/register', false)])
  private async saved (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.renderSaved(req, res)
  }

  @Post('update/info')
  @Middleware([updateInfoRateLimit, CheckIfUserExistAndRedirect('/register', false)])
  private async updateInformation (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.updateInfo(req, res)
  }

  @Post('update/password')
  @Middleware([updatePasswordRateLimit, CheckIfUserExistAndRedirect('/register', false)])
  private async updatePassword (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.updatePassword(req, res)
  }

  @Get('save/:id')
  @Middleware([saveAssetRateLimit, CheckIfUserExistAndSendError('Unable to save, are you logged in?')])
  private async saveAsset (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.saveAsset(req, res)
  }

  @Get('download')
  @Middleware([downloadInfoRateLimit, CheckIfUserExistAndSendError('Unable to download information, are you logged in?')])
  private async downloadInfo (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.downloadInformation(req, res)
  }

  @Get('delete')
  @Middleware([deleteAccountRateLimit, CheckIfUserExistAndSendError('Unable to delete account, are you logged in?')])
  private async delteAccount (req: Request, res: Response): Promise<void> {
    return await this.DashboardService.deleteAccount(req, res)
  }
}
