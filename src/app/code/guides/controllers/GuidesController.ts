import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
import { GuidesService } from '../services/GuidesService'

@Controller('guides')
export class GuidesController {
  private readonly GuidesService: GuidesService = new GuidesService()

  @Get('/')
  private index (_req: Request, res: Response): void {
    return this.GuidesService.renderIndex(_req, res)
  }

  // Declared before `:slug` so the literal feed.xml route wins over the param.
  @Get('feed.xml')
  private feed (_req: Request, res: Response): void {
    return this.GuidesService.renderFeed(_req, res)
  }

  @Get(':slug')
  private view (req: Request, res: Response): void {
    return this.GuidesService.renderGuide(req, res)
  }
}
