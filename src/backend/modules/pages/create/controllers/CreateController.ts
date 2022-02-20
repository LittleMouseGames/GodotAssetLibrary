import { Controller, Get, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { CheckIfUserExistAndRedirect } from 'utility/middleware/CheckIfUserExistAndRedirect'
import { CreateService } from '../services/CreateService'

@Controller('create')
export class CreateController {
  private readonly CreateService: CreateService = new CreateService()

  /**
   * New asset index
   *
   * @param {Request} req
   * @param {Response} res
   * @returns
   */
  @Get('/')
  @Middleware(CheckIfUserExistAndRedirect('/register', false))
  private index (req: Request, res: Response): void {
    try {
      return this.CreateService.render(req, res)
    } catch (e: any) {
      res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
