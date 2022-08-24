import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { GetDoesUserExistByToken } from 'core/modules/authentication/models/user/GET/GetDoesUserExistByToken'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'

/**
 * Check if user exists and send error if not
 *
 * @param {string} error error message to print if not found
 * @returns
 */
export function CheckIfUserExistAndSendError (error: string = 'User not found'): any {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const authToken = req.cookies['auth-token']

    if (authToken === undefined) {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: 'Missing auth token, are you logged in?' })
    }

    const tokenServices = TokenServices.getInstance()
    const hashedToken = tokenServices.hashToken(authToken)

    if (await GetDoesUserExistByToken(hashedToken)) {
      req.body.hashedToken = hashedToken
      next()
    } else {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: error })
    }
  }
}
