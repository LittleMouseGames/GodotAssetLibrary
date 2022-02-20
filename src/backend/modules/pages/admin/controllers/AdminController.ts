import { Controller, Get, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { AdminService } from '../services/AdminService'

@Controller('admin')
export class AdminController {
  private readonly AdminService: AdminService = new AdminService()

  @Get('/')
  @Middleware([CheckIfUserExistAndRedirect('/register', false)])
  private async index (req: Request, res: Response): Promise<void> {
    return await this.AdminService.render(req, res)
  }
}
