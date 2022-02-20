import { Request, Response } from 'express'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'

export class RegisterService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public async render (_req: Request, res: Response): Promise<void> {
    const authToken = _req.cookies['auth-token']

    const pageBanner = {
      title: 'Login or Register',
      info: 'Make the best of <strong>Godot Library</strong> with a free account'
    }

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
        res.redirect('/dashboard')
      } catch (e) {
        return res.render('templates/pages/register/register', { pageBanner: pageBanner })
      }
    } else {
      return res.render('templates/pages/register/register', { pageBanner: pageBanner })
    }
  }
}
