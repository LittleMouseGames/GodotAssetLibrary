import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'

import { CreateService } from '../services/CreateService'

/**
 * The user controller
 */
@Controller('create')
export class CreateController {
  private readonly CreateService: CreateService = new CreateService()

  /**
   * Home
   */
  @Get('/')
  private index (req: Request, res: Response): void {
    return this.CreateService.render(req, res)
  }
}
