import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { GetDoesUserExistByToken } from 'modules/api/authentication/models/user/GET/GetDoesUserExistByToken'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'

export function CheckIfUserExistAndSendError (): any {
  return (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.cookies['auth-token']
    if (authToken !== undefined) {
      const tokenServices = TokenServices.getInstance()
      const hashedToken = tokenServices.hashToken(authToken)

      GetDoesUserExistByToken(hashedToken).then(() => {
        req.body.hashedToken = hashedToken
        next()
      }).catch(e => {
        return res.status(StatusCodes.BAD_REQUEST).send({ error: e.message })
      })
    } else {
      return res.status(StatusCodes.BAD_REQUEST).send({ error: 'Missing auth token, are you logged in?' })
    }
  }
}
