import { Request, Response } from 'express'
import { GetDoesUsernameExist } from 'modules/api/authentication/models/user/GET/GetDoesUsernameExist'
import { UserServices } from 'modules/api/authentication/services/UserServices'
import { GetUserInfoByToken } from '../models/GET/GetUserInfoByToken'
import { UpdateUserInformtaion } from '../models/UPDATE/UpateUserInformation'

export class DashboardService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public async render (req: Request, res: Response): Promise<void> {
    const info = await GetUserInfoByToken(req.body.hashedToken)
    return res.render('templates/pages/dashboard/dashboard', { info: info })
  }

  public async updateInfo (req: Request, res: Response): Promise<void> {
    // lets verify if a username already exists with that name
    const username = req.body.username ?? ''
    const email = req.body.email ?? ''
    const hashedToken = req.body.hashedToken ?? ''

    if (username === '' || email === '' || hashedToken === '') {
      throw new Error('Missing required username or email')
    }

    const UserService = UserServices.getInstance()

    if (!UserService.isUsernameValid(username)) {
      throw new Error('Username isn\'t valid')
    }

    if (await GetDoesUsernameExist(username)) {
      throw new Error('Username already in use')
    }

    await UpdateUserInformtaion(hashedToken, username, email)

    const info = await GetUserInfoByToken(req.body.hashedToken)
    return res.render('templates/pages/dashboard/dashboard', { info: info })
  }
}
