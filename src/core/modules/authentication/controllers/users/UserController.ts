import { StatusCodes } from 'http-status-codes'
import { Controller, Post, Middleware } from '@overnightjs/core'
import { Request, Response } from 'express'
import { UserServices } from 'core/modules/authentication/services/UserServices'
import bodyParser from 'body-parser'
import rateLimit from 'express-rate-limit'
import { PasswordHasherBusyError } from 'core/modules/authentication/services/PasswordHasher'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { DeleteResumeToken } from 'core/modules/authentication/models/user/DELETE/DeleteResumeToken'
import { buildUserContextCacheKey, cacheDelete } from 'core/utils/dragonfly'

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

  private readonly cookieOptions = {
    httpOnly: true,
    secure: process.env.RUN_MODE === 'prod',
    sameSite: 'lax' as const,
    path: '/',
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

      // Set the HttpOnly cookie only; never return the raw token to JS.
      return res.status(StatusCodes.OK).cookie('auth-token', registerService, this.cookieOptions).send({
        ok: true,
        redirect: '/dashboard'
      })
    } catch (e: any) {
      const status = e instanceof PasswordHasherBusyError ? StatusCodes.SERVICE_UNAVAILABLE : StatusCodes.BAD_REQUEST
      return res.status(status).send({ error: e.message })
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
      return res.status(StatusCodes.OK).cookie('auth-token', loginService, this.cookieOptions).send({
        ok: true,
        redirect: '/dashboard'
      })
    } catch (e: any) {
      const status = e instanceof PasswordHasherBusyError ? StatusCodes.SERVICE_UNAVAILABLE : StatusCodes.BAD_REQUEST
      return res.status(status).send({ error: e.message })
    }
  }

  /**
 * Logout endpoint
 *
 * @param {Request} _req
 * @param {Response} res
 */
  @Post('logout')
  private async logout (req: Request, res: Response): Promise<void> {
    const authToken = req.cookies['auth-token'] ?? ''
    if (authToken !== '') {
      const tokenServices = TokenServices.getInstance()
      const hashedToken = tokenServices.hashToken(authToken)
      try {
        await DeleteResumeToken(hashedToken)
      } catch (e) {
        // token revocation is best-effort; the cookie is still cleared
      }
      // Drop the cached login context so a logged-out session can't appear
      // authenticated for up to the cache TTL.
      void cacheDelete(buildUserContextCacheKey(hashedToken))
    }
    res.clearCookie('auth-token')
    res.redirect('/')
  }
}
