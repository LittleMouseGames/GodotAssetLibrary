import { ClassMiddleware, Controller, Get, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { CheckIfUserAdminAndRedirectIfNot } from 'utility/middleware/CheckIfUserAdminAndRedirectIfNot'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { AdminService } from '../services/AdminService'

@Controller('admin')
@ClassMiddleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
export class AdminController {
  private readonly AdminService: AdminService = new AdminService()

  @Get('/')
  private async index (req: Request, res: Response): Promise<void> {
    return await this.AdminService.render(req, res)
  }

  @Get('featured')
  private async featured (req: Request, res: Response): Promise<void> {
    return await this.AdminService.renderFeatured(req, res)
  }

  @Get('reports')
  private async reports (req: Request, res: Response): Promise<void> {
    return await this.AdminService.renderReports(req, res)
  }

  @Get('report/approve/:id')
  private async approveReport (req: Request, res: Response): Promise<void> {
    return await this.AdminService.approveReport(req, res)
  }

  @Get('report/ignore/:id')
  private async ignoreReport (req: Request, res: Response): Promise<void> {
    return await this.AdminService.ignoreReport(req, res)
  }

  @Post('update/settings')
  private async updateSiteSettings (req: Request, res: Response): Promise<void> {
    return await this.AdminService.updateSiteSettings(req, res)
  }

  @Get('feature-post/:id')
  private async updateFeaturedAssets (req: Request, res: Response): Promise<void> {
    return await this.AdminService.featureAsset(req, res)
  }
}
