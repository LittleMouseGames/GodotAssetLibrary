import * as argon2 from 'argon2'
import { logger } from 'utility/logger'
import { InsertUser } from 'modules/api/authentication/models/user/INSERT/insert.user'
import { Request } from 'express'
import { InsertToken } from 'modules/api/authentication/models/user/INSERT/insert.token'
import { GetPasswordHash } from 'modules/api/authentication/models/user/GET/GetPasswordHash'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'
import { GetDoesUsernameExist } from '../models/user/GET/GetDoesUsernameExist'

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
      throw new Error('Username validation failed')
    } else if (!this.PASSWORD_REGEX.test(password)) {
      throw new Error('Password failed validation. Is it too short?')
    } else if (password !== passwordConf) {
      throw new Error('Password mismatch')
    } else if (email === '') {
      throw new Error('Email validation failed or none supplied')
    }

    if (await GetDoesUsernameExist(username)) {
      throw new Error('Username already in use')
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
      throw new Error('Failed to create user')
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

    if (authHeader.includes('Bearer')) {
      // TODO: bearer token implementation
    } else {
      // if not explicity Bearer token, we'll assume basic auth

      let username = ''
      let password = ''

      if (authHeader.includes('Basic')) {
        let authString = authHeader.split('Basic ')[1]
        authString = Buffer.from(authString, 'base64').toString('ascii')
        username = authString.split(':')[0] ?? ''
        password = authString.split(':')[1] ?? ''
      } else {
        username = req.body.username ?? ''
        password = req.body.password ?? ''
      }

      if (username === '' || password === '') {
        throw new Error('Missing auth params')
      }

      try {
        const passwordHash = await GetPasswordHash(username)
        const verify = await argon2.verify(passwordHash.password, password)

        if (!verify) {
          throw new Error('Invalid credentials')
        }

        const token = this.TokenService.generateToken()
        const tokenHash = this.TokenService.hashToken(token)
        const tokenExpires = this.TokenService.generateExpiry()

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
