import { Controller, Get, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { RegisterService } from '../services/RegisterService'

/**
 * The user controller
 */
@Controller('register')
export class RegisterController {
  private readonly RegisterService: RegisterService = new RegisterService()

  /**
   * Home
   */
  @Get('/')
  @Middleware(CheckIfUserExistAndRedirect('/dashboard', true))
  private async index (req: Request, res: Response): Promise<void> {
    return await this.RegisterService.render(req, res)
  }
}
