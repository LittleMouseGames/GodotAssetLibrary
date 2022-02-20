import { Controller, Get, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { SearchService } from '../services/SearchService'

@Controller('search')
export class SearchController {
  private readonly SearchService: SearchService = new SearchService()

  @Get('/')
  private async index (req: Request, res: Response): Promise<void> {
    try {
      return await this.SearchService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Post('/')
  private async getQuery (req: Request, res: Response): Promise<void> {
    return this.SearchService.redirectToSearchUrl(req, res)
  }
}
