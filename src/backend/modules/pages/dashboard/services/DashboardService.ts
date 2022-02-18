import { Request, Response } from 'express'
import { GetDoesUsernameExist } from 'modules/api/authentication/models/user/GET/GetDoesUsernameExist'
import { GetPasswordHashByToken } from 'modules/api/authentication/models/user/GET/GetPasswordHashByToken'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { UpdatePasswordHashByToken } from 'modules/api/authentication/models/user/UPDATE/UpdatePasswordHashByToken'
import { UserServices } from 'modules/api/authentication/services/UserServices'
import { GetUserInfoByToken } from '../models/GET/GetUserInfoByToken'
import { UpdateUserInformtaion } from '../models/UPDATE/UpateUserInformation'
import { UpdateCommentsInformationByUserId } from '../models/UPDATE/UpdateCommentsUsernameByUserId'

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

    const userId = await GetUserByToken(hashedToken)

    await UpdateUserInformtaion(hashedToken, username, email)
    await UpdateCommentsInformationByUserId(userId, username)

    const info = await GetUserInfoByToken(req.body.hashedToken)
    return res.render('templates/pages/dashboard/dashboard', { info: info })
  }

  public async updatePassword (req: Request, res: Response): Promise<void> {
    const currentPassword = req.body['password-current'] ?? ''
    const newPassword = req.body['new-password'] ?? ''
    const newPasswordConf = req.body['new-password-conf'] ?? ''
    const hashedToken = req.body.hashedToken ?? ''

    if (currentPassword === '' || newPassword === '' || newPasswordConf === '' || hashedToken === '') {
      throw new Error('Missing required current password or new password')
    }

    if (newPassword !== newPasswordConf) {
      throw new Error('Password mis-match')
    }

    const UserService = UserServices.getInstance()

    if (!UserService.isPasswordValid(newPassword)) {
      throw new Error('Password doesn\'t meet requirements')
    }

    const currentPasswordHash = await GetPasswordHashByToken(hashedToken)

    if (!(await UserService.doesPasswordMatchHash(currentPasswordHash, currentPassword))) {
      throw new Error('Incorrect password')
    }

    const newPasswordHash = await UserService.hashPassword(newPassword)

    await UpdatePasswordHashByToken(hashedToken, newPasswordHash)

    const info = await GetUserInfoByToken(req.body.hashedToken)
    return res.render('templates/pages/dashboard/dashboard', { info: info })
  }
}
