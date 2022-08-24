import { NextFunction, Request, Response } from 'express'
import { GetUserIdByToken } from 'core/modules/authentication/models/user/GET/GetUserIdByToken'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'

/**
 * Check if user exists and redirect if not
 *
 * @param redirect redirect to this page if not found
 * @param redirectOnUserFound do we want to redirect if user found?
 * @returns
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

      GetUserIdByToken(hashedToken).then(() => {
        if (redirectOnUserFound) {
          return res.redirect(redirect)
        } else {
          req.body.hashedToken = hashedToken
          next()
        }
      }).catch((_e: any) => {
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
