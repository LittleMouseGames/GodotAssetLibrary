import { Controller, Get, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import { LostService } from '../services/LostService'
import rateLimit from 'express-rate-limit'

const renderLostRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 60, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too often, please try again later' })
})

@Controller('lost')
export class LostController {
  private readonly LostService: LostService = new LostService()

  @Get('/')
  @Middleware(renderLostRateLimit)
  private index (req: Request, res: Response): void {
    // TODO: Cache below response (make page generic so no sensitive info is exposed)
    return this.LostService.render(req, res)
  }
}
