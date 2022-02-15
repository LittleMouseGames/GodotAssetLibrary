import { NextFunction, Request, Response } from 'express'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'

/**
 * Inject user data into response object
 *
 * @param {Request} req
 * @param {Response} res
 */
export function CheckIfUserExistAndRedirect (redirect: string, redirectOnUserFound: boolean): any {
  return (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.cookies['auth-token']
    if (authToken !== undefined) {
      const tokenServices = TokenServices.getInstance()
      const hashedToken = tokenServices.hashToken(authToken)

      /**
     * if a user has a token, lets see if its valid
     * for any users currently who have tokens
     *
     * yes: go to dashboard
     * no: go to register page
     */

      GetUserByToken(hashedToken).then(() => {
        if (redirectOnUserFound) {
          return res.redirect(redirect)
        } else {
          req.body.hashedToken = hashedToken
          next()
        }
      }).catch(e => {
        if (redirectOnUserFound) {
          next()
        } else {
          return res.redirect(redirect)
        }
      })
    } else {
      if (redirectOnUserFound) {
        next()
      } else {
        return res.redirect(redirect)
      }
    }
  }
}