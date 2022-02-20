import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

import { HomepageService } from '../services/HomepageService'

@Controller('/')
export class HomepageController {
  private readonly HomepageService: HomepageService = new HomepageService()

  @Get('/')
  private async index (req: Request, res: Response): Promise<void> {
    try {
      return await this.HomepageService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
