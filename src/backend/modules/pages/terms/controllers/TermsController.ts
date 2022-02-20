import { Controller, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

import { TermsService } from '../services/TermsService'

@Controller('terms')
export class TermsController {
  private readonly TermsService: TermsService = new TermsService()

  @Get('/')
  private index (req: Request, res: Response): void {
    try {
      return this.TermsService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('privacy-policy')
  private privacy (req: Request, res: Response): void {
    try {
      return this.TermsService.renderPrivacyPolicy(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('terms-of-service')
  private terms (req: Request, res: Response): void {
    try {
      return this.TermsService.renderTermsOfService(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('cookie-policy')
  private cookie (req: Request, res: Response): void {
    try {
      return this.TermsService.renderCookiePolicy(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  @Get('acceptable-use-policy')
  private acceptable (req: Request, res: Response): void {
    try {
      return this.TermsService.renderAcceptableUsePolicy(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
