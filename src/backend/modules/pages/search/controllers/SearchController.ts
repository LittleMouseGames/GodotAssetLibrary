import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { SearchService } from '../services/SearchService'

const searchRedirectRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 40, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

const searchRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 40, // start blocking after x requests
  message: JSON.stringify({ error: 'You\'re doing that too much, please try again later' })
})

@Controller('search')
export class SearchController {
  private readonly SearchService: SearchService = new SearchService()

  @Get('/')
  @Middleware(searchRateLimit)
  private async index (req: Request, res: Response): Promise<void> {
    return await this.SearchService.render(req, res)
  }

  @Post('/')
  @Middleware(searchRedirectRateLimit)
  private async getQuery (req: Request, res: Response): Promise<void> {
    return this.SearchService.redirectToSearchUrl(req, res)
  }
}
