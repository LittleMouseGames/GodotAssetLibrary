import { StatusCodes } from 'http-status-codes'
import { Controller, Post, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import { UserServices } from 'modules/api/authentication/services/UserServices'
import bodyParser from 'body-parser'
import rateLimit from 'express-rate-limit'

const urlencodedParser = bodyParser.urlencoded({ extended: false })

const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // start blocking after 5 requests
  message: JSON.stringify({ error: 'Too many registration attempts from this IP, please try again later' })
})

/**
 * The user controller
 */
@Controller('api/users')
export class UserController {
  private constructor (
    private readonly AuthService: UserServices = UserServices.getInstance()
  ) { }

  /**
   * Register endpoint
   */
  @Post('register')
  @Middleware([urlencodedParser, createAccountLimiter])
  private async register (req: Request, res: Response): Promise<Response> {
    try {
      const registerService = await this.AuthService.register(req)
      return res.status(StatusCodes.OK).send({ token: registerService })
    } catch (e: any) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  /**
   * Login endpoint
   */
  @Post('login')
  private async login (req: Request, res: Response): Promise<Response> {
    try {
      const loginService = await this.AuthService.login(req)
      return res.status(StatusCodes.OK).send({ token: loginService })
    } catch (e: any) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }
}
