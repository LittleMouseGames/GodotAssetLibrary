import { Controller, Get, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { HomepageService } from '../services/HomepageService'

const fetchHomepageRatelimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 30, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

@Controller('/')
export class HomepageController {
  private readonly HomepageService: HomepageService = new HomepageService()

  @Get('/')
  @Middleware(fetchHomepageRatelimit)
  private async index (req: Request, res: Response): Promise<void> {
    return await this.HomepageService.render(req, res)
  }
}
