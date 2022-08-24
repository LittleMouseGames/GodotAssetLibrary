import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
import { LostService } from '../services/LostService'

@Controller('lost')
export class LostController {
  private readonly LostService: LostService = new LostService()

  @Get('/')
  private index (req: Request, res: Response): void {
    return this.LostService.render(req, res)
  }
}
