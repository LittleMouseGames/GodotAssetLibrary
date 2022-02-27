import { StatusCodes } from 'http-status-codes'
import { Controller, Post, Middleware, Get } from '@overnightjs/core'
import { Request, Response } from 'express'
import { UserServices } from 'modules/common/authentication/services/UserServices'
import bodyParser from 'body-parser'
import rateLimit from 'express-rate-limit'

const urlencodedParser = bodyParser.urlencoded({ extended: false })

const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 7, // start blocking after x requests
  message: JSON.stringify({ error: 'Too many registration attempts from this IP, please try again later' })
})

const accountLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // start blocking after x requests
  message: JSON.stringify({ error: 'Too many login attempts from this IP, please try again later' })
})

/**
 * The user controller
 */
@Controller('api/users')
export class UserController {
  private constructor (
    private readonly AuthService: UserServices = UserServices.getInstance()
  ) { }

  private readonly cookieOptons = {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 5 // expire after 5 days
  }

  /**
   * Register endpoint
   *
   * @param {Request} req
   * @param {Response} res
   * @returns {Response}
   */
  @Post('register')
  @Middleware([urlencodedParser, createAccountLimiter])
  private async register (req: Request, res: Response): Promise<Response> {
    try {
      const registerService = await this.AuthService.register(req)

      return res.status(StatusCodes.OK).cookie('auth-token', registerService, this.cookieOptons).send({ token: registerService })
    } catch (e: any) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  /**
   * Login enpoint
   *
   * @param {Request} req
   * @param {Response} res
   * @returns {Response}
   */
  @Post('login')
  @Middleware([urlencodedParser, accountLoginLimiter])
  private async login (req: Request, res: Response): Promise<Response> {
    try {
      const loginService = await this.AuthService.login(req)
      return res.status(StatusCodes.OK).cookie('auth-token', loginService, this.cookieOptons).send({ token: loginService })
    } catch (e: any) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
    }
  }

  /**
 * Logout endpoint
 *
   * @param {Request} _req
   * @param {Response} res
 */
  @Get('logout')
  private logout (_req: Request, res: Response): void {
    res.clearCookie('auth-token')
    res.redirect('/')
  }
}
