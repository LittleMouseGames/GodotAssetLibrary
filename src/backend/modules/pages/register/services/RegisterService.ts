import { Request, Response } from 'express'
import { GetUserIdByToken } from 'modules/common/authentication/models/user/GET/GetUserIdByToken'
import { TokenServices } from 'modules/common/authentication/services/TokenServices'
import striptags from 'striptags'

export class RegisterService {
  public async render (req: Request, res: Response): Promise<void> {
    const authToken = striptags(req.cookies['auth-token'])

    const pageBanner = {
      title: 'Login or Register',
      info: 'Make the best of <strong>Godot Asset Library</strong> with a free account'
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
        await GetUserIdByToken(hashedToken)
        res.redirect('/dashboard')
      } catch (e) {
        return res.render('templates/pages/register/register', { pageBanner: pageBanner })
      }
    } else {
      return res.render('templates/pages/register/register', { pageBanner: pageBanner })
    }
  }
}
