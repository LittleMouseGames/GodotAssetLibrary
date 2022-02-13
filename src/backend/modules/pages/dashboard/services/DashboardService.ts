import { Request, Response } from 'express'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'

export class DashboardService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public async render (_req: Request, res: Response): Promise<void> {
    const authToken = _req.cookies['auth-token']
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
      try {
        await GetUserByToken(hashedToken)
        return res.render('templates/pages/dashboard/dashboard')
      } catch (e) {
        return res.redirect('/register')
      }
    } else {
      return res.redirect('/register')
    }
  }
}
