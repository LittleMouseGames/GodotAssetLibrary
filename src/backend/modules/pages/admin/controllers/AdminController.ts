import { ClassMiddleware, Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { CheckIfUserAdminAndRedirectIfNot } from 'utility/middleware/CheckIfUserAdminAndRedirectIfNot'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { AdminService } from '../services/AdminService'

const featureAssetRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 20, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too often, please try again later' })
})

const viewFeaturedRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 30, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

const reportActionRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 30, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

const siteActionRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 10, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

const viewReportsRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 50, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

@Controller('admin')
@ClassMiddleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
export class AdminController {
  private readonly AdminService: AdminService = new AdminService()

  @Get('/')
  private async index (req: Request, res: Response): Promise<void> {
    return await this.AdminService.render(req, res)
  }

  @Get('featured')
  @Middleware(viewFeaturedRateLimit)
  private async featured (req: Request, res: Response): Promise<void> {
    return await this.AdminService.renderFeatured(req, res)
  }

  @Get('reports')
  @Middleware(viewReportsRateLimit)
  private async reports (req: Request, res: Response): Promise<void> {
    return await this.AdminService.renderReports(req, res)
  }

  @Get('report/approve/:id')
  @Middleware(reportActionRateLimit)
  private async approveReport (req: Request, res: Response): Promise<void> {
    return await this.AdminService.approveReport(req, res)
  }

  @Get('report/ignore/:id')
  @Middleware(reportActionRateLimit)
  private async ignoreReport (req: Request, res: Response): Promise<void> {
    return await this.AdminService.ignoreReport(req, res)
  }

  @Post('update/settings')
  @Middleware(siteActionRateLimit)
  private async updateSiteSettings (req: Request, res: Response): Promise<void> {
    return await this.AdminService.updateSiteSettings(req, res)
  }

  @Get('feature-post/:id')
  @Middleware(featureAssetRateLimit)
  private async updateFeaturedAssets (req: Request, res: Response): Promise<void> {
    return await this.AdminService.featureAsset(req, res)
  }
}
