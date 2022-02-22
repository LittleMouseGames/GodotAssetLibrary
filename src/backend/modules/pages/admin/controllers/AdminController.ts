import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { CheckIfUserAdminAndRedirectIfNot } from 'utility/middleware/CheckIfUserAdminAndRedirectIfNot'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { AdminService } from '../services/AdminService'

@Controller('admin')
export class AdminController {
  private readonly AdminService: AdminService = new AdminService()

  @Get('/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async index (req: Request, res: Response): Promise<void> {
    return await this.AdminService.render(req, res)
  }

  @Get('featured')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async featured (req: Request, res: Response): Promise<void> {
    return await this.AdminService.renderFeatured(req, res)
  }

  @Post('update/settings')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async updateSiteSettings (req: Request, res: Response): Promise<void> {
    return await this.AdminService.updateSiteSettings(req, res)
  }

  @Get('feature-post/:id')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async updateFeaturedAssets (req: Request, res: Response): Promise<void> {
    return await this.AdminService.featureAsset(req, res)
  }
}
