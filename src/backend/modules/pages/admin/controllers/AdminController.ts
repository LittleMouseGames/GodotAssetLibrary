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
    return await this.AdminService.render(req, res)
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
}
