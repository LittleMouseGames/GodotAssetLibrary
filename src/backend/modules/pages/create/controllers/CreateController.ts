import { Controller, Get, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
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
    return this.CreateService.render(req, res)
  }
}
