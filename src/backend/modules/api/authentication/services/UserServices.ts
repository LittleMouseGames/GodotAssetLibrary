import * as argon2 from 'argon2'
import { logger } from 'utility/logger'
import { InsertUser } from 'modules/api/authentication/models/user/INSERT/insert.user'
import { Request } from 'express'
import { InsertToken } from 'modules/api/authentication/models/user/INSERT/insert.token'
import { GetPasswordHash } from 'modules/api/authentication/models/user/GET/get.password.hash'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/get.user.by.token'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'

export class UserServices {
  private static instance: UserServices
  private readonly USERNAME_REGEX: RegExp = /^[a-z0-9_-]{3,16}$/
  private readonly PASSWORD_REGEX: RegExp = /^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,})/
  private readonly TokenService: TokenServices = TokenServices.getInstance()

  /**
   * Return our class for singleton init
   */
  public static getInstance (): UserServices {
    if (UserServices.instance == null) {
      UserServices.instance = new UserServices()
    }

    return UserServices.instance
  }

  /**
   * Account registration
   *
   * @param {Request} req request object
   *
   * @returns {string} resume token
   *
   * @throws {Error} Username Regex error
   * @throws {Error} Password Regex error
   * @throws {Error} Password match error
   * @throws {Error} Auth token missing error
   */
  public async register (req: Request): Promise<string> {
    const username = req.body.username ?? ''
    const password = req.body.password ?? ''
    const passwordConf = req.body.passwordConf ?? ''
    const email = req.body.email ?? ''

    if (!this.USERNAME_REGEX.test(username)) {
      throw new Error('Username validation fail')
    } else if (!this.PASSWORD_REGEX.test(password)) {
      throw new Error('Password validation fail')
    } else if (password !== passwordConf) {
      throw new Error('Password mismatch')
    } else if (email === '') {
      throw new Error('Email validation fail')
    }

    const tokenExpires = this.TokenService.generateExpiry()
    const token = this.TokenService.generateToken()
    const tokenHash = this.TokenService.hashToken(token)
    const passwordHash = await argon2.hash(password)

    try {
      await InsertUser(username, passwordHash, tokenHash, tokenExpires)
      return token
    } catch (e: any) {
      logger.log('error', e.message)
      throw new Error('Unrecoverable error')
    }
  }

  /**
   * Account login
   *
   * @param {Request} req request object
   *
   * @returns {string} resume token
   *
   * @throws {Error} header error
   * @throws {Error} param error
   * @throws {Error} mongo insert / find error
   */
  public async login (req: Request): Promise<string> {
    const authHeader = req.headers.authorization ?? ''

    if (authHeader === '') {
      throw new Error('Missing auth header')
    }

    // basic auth
    if (authHeader.includes('Basic')) {
      let authString = authHeader.split('Basic ')[1]
      authString = Buffer.from(authString, 'base64').toString('ascii')

      const username = authString.split(':')[0] ?? ''
      const password = authString.split(':')[1] ?? ''

      if (username === '' || password === '') {
        throw new Error('Missing auth params')
      }

      const token = this.TokenService.generateToken()
      const tokenHash = this.TokenService.hashToken(token)
      const tokenExpires = this.TokenService.generateExpiry()

      try {
        const passwordHash = await GetPasswordHash(username)
        const verify = await argon2.verify(passwordHash.password, password)

        if (!verify) {
          throw new Error('Invalid credentials')
        }

        await InsertToken(username, tokenHash, tokenExpires)

        return token
      } catch (e: any) {
        logger.log('error', e.message)
        throw new Error(e.message)
      }
    }

    throw new Error('Invalid auth param')
  }

  /**
   * Find user with token
   */
  public async verify (token: string): Promise<string> {
    const hashedToken = this.TokenService.hashToken(token)
    const userId = await GetUserByToken(hashedToken)
    return userId
  }
}
