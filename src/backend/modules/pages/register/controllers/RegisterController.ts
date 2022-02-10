import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'

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
  private index (req: Request, res: Response): void {
    return this.RegisterService.render(req, res)
  }
}
