import { NextFunction, Request, Response } from 'express'
import { GetUserIdByToken } from 'modules/api/authentication/models/user/GET/GetUserIdByToken'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'

export function CheckIfUserAdminAndRedirectIfNot (redirect: string): any {
  return (req: Request, res: Response, next: NextFunction) => {
    const authToken = req.cookies['auth-token']
    if (authToken !== undefined) {
      const tokenServices = TokenServices.getInstance()
      const hashedToken = tokenServices.hashToken(authToken)

      GetUserIdByToken(hashedToken).then(() => {
        req.body.hashedToken = hashedToken
        next()
      }).catch((_e: any) => {
        return res.redirect(redirect)
      })
    } else {
      return res.redirect(redirect)
    }
  }
}
