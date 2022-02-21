import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { LostService } from '../services/LostService'

@Controller('lost')
export class LostController {
  private readonly LostService: LostService = new LostService()

  @Get('/')
  private index (req: Request, res: Response): void {
    try {
      return this.LostService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
