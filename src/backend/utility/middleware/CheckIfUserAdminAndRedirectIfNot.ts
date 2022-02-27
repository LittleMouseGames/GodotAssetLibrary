import { NextFunction, Request, Response } from 'express'
import { GetUserRoleByToken } from 'modules/common/authentication/models/user/GET/GetUserRoleByToken'

export function CheckIfUserAdminAndRedirectIfNot (redirect: string): any {
  return (req: Request, res: Response, next: NextFunction) => {
    const hashedToken = req.body.hashedToken
    if (hashedToken !== undefined) {
      GetUserRoleByToken(hashedToken).then((role) => {
        if (role === 'admin') {
          req.body.userRole = role
          next()
        } else {
          return res.redirect(redirect)
        }
      }).catch((_e: any) => {
        return res.redirect(redirect)
      })
    } else {
      return res.redirect(redirect)
    }
  }
}
