import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { CheckIfUserAdminAndRedirectIfNot } from 'utility/middleware/CheckIfUserAdminAndRedirectIfNot'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { AdminService } from '../services/AdminService'

@Controller('admin')
export class AdminController {
  private readonly AdminService: AdminService = new AdminService()

  @Get('/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async index (req: Request, res: Response): Promise<void> {
    try {
      return await this.AdminService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('featured')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async featured (req: Request, res: Response): Promise<void> {
    try {
      return await this.AdminService.renderFeatured(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Post('update/promobar')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async updatePromobarMessage (req: Request, res: Response): Promise<void> {
    try {
      return await this.AdminService.updatePromobarMessage(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('feature-post/:id')
  @Middleware([CheckIfUserExistAndRedirect('/register', false), CheckIfUserAdminAndRedirectIfNot('/404')])
  private async updateFeaturedAssets (req: Request, res: Response): Promise<void> {
    try {
      return await this.AdminService.featureAsset(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
