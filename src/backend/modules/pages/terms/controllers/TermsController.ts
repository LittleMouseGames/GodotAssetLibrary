import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
import { TermsService } from '../services/TermsService'

@Controller('terms')
export class TermsController {
  private readonly TermsService: TermsService = new TermsService()

  @Get('/')
  private index (req: Request, res: Response): void {
    return this.TermsService.render(req, res)
  }

  @Get('privacy-policy')
  private privacy (req: Request, res: Response): void {
    return this.TermsService.renderPrivacyPolicy(req, res)
  }

  @Get('terms-of-service')
  private terms (req: Request, res: Response): void {
    return this.TermsService.renderTermsOfService(req, res)
  }

  @Get('cookie-policy')
  private cookie (req: Request, res: Response): void {
    return this.TermsService.renderCookiePolicy(req, res)
  }

  @Get('acceptable-use-policy')
  private acceptable (req: Request, res: Response): void {
    return this.TermsService.renderAcceptableUsePolicy(req, res)
  }
}
