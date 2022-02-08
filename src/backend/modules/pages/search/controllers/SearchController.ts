import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'

import { SearchService } from '../services/SearchService'

/**
 * The user controller
 */
@Controller('search')
export class SearchController {
  private readonly SearchService: SearchService

  public constructor () {
    this.SearchService = new SearchService()
  }

  /**
   * Home
   */
  @Get('/')
  private index (req: Request, res: Response): void {
    return this.SearchService.render(req, res)
  }
}
