import { Controller, Get, Post } from '@overnightjs/core'
import { Request, Response } from 'express'

import { SearchService } from '../services/SearchService'

/**
 * The user controller
 */
@Controller('search')
export class SearchController {
  private readonly SearchService: SearchService = new SearchService()

  /**
   * Home
   */
  @Get('/')
  private async index (req: Request, res: Response): Promise<void> {
    return await this.SearchService.render(req, res)
  }

  /**
   * Home
   */
  @Post('/')
  private async getQuery (req: Request, res: Response): Promise<void> {
    return this.SearchService.redirectToSearchUrl(req, res)
  }
}
