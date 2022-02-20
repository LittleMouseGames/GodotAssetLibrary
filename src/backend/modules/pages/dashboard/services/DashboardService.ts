import { Request, Response } from 'express'
import { GetDoesUsernameExist } from 'modules/api/authentication/models/user/GET/GetDoesUsernameExist'
import { GetIsUsernameReserved } from 'modules/api/authentication/models/user/GET/GetIsUsernameReserved'
import { GetPasswordHashByToken } from 'modules/api/authentication/models/user/GET/GetPasswordHashByToken'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/GetUserByToken'
import { UpdatePasswordHashByToken } from 'modules/api/authentication/models/user/UPDATE/UpdatePasswordHashByToken'
import { UserServices } from 'modules/api/authentication/services/UserServices'
import { GetDoesPostExistById } from 'modules/pages/asset/models/GET/GetDoesPostExistById'
import { GetUserAssetsFromQuery } from '../models/GET/GetUserAssetsFromQuery'
import { GetUserSavedAssets } from '../models/GET/GetUserSavedAssets'
import { GetUserInfoByToken } from '../models/GET/GetUserInfoByToken'
import { GetUserReviewedAssets } from '../models/GET/GetUserReviewedAssets'
import { UpdateUserInformtaion } from '../models/UPDATE/UpateUserInformation'
import { UpdateCommentsInformationByUserId } from '../models/UPDATE/UpdateCommentsUsernameByUserId'
import { UpdateUserSavedAssets } from '../models/UPDATE/UpdateUserSavedAssets'

export class DashboardService {
  public async render (req: Request, res: Response): Promise<void> {
    const info = await GetUserInfoByToken(req.body.hashedToken)

    const pageBanner = {
      title: 'Account Information',
      info: 'Manage your account information, including username and password'
    }

    return res.render('templates/pages/dashboard/dashboard', { info: info, pageBanner: pageBanner })
  }

  public async renderReviews (req: Request, res: Response): Promise<void> {
    let limit = Number(req.query.limit ?? 12)
    const page = Number(req.query.page ?? 0)

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page

    const reviewedAssetList = await GetUserReviewedAssets(req.body.hashedToken)
    const reviewedAssets = await GetUserAssetsFromQuery(limit, skip, reviewedAssetList)

    const pageBanner = {
      title: 'Reviewed Assets',
      info: 'View all assets you\'ve left reviews on'
    }

    return res.render('templates/pages/dashboard/reviews', { assets: reviewedAssets, params: req.originalUrl, pageBanner: pageBanner })
  }

  public async renderSaved (req: Request, res: Response): Promise<void> {
    let limit = Number(req.query.limit ?? 12)
    const page = Number(req.query.page ?? 0)

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page

    const reviewedAssetList = await GetUserSavedAssets(req.body.hashedToken) ?? []
    const reviewedAssets = await GetUserAssetsFromQuery(limit, skip, reviewedAssetList)

    const pageBanner = {
      title: 'Saved Assets',
      info: 'View all assets you\'ve saved'
    }

    return res.render('templates/pages/dashboard/reviews', { assets: reviewedAssets, params: req.originalUrl, pageBanner: pageBanner })
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

    if (await GetIsUsernameReserved(username)) {
      throw new Error('Username is reserved since its used on an asset thats been imported. If this username and those assets belong to you, please reach out so that you can claim this username.')
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

  public async saveAsset (req: Request, res: Response): Promise<void> {
    const asset = req.params.id ?? ''
    const hashedToken = req.body.hashedToken ?? ''

    if (hashedToken === '') {
      throw new Error('Missing user auth')
    }

    if (asset === '') {
      throw new Error('Missing asset id')
    }

    if (!(await GetDoesPostExistById(asset))) {
      throw new Error('Asset not found')
    }

    const userSaved = await GetUserSavedAssets(hashedToken)

    if (userSaved?.includes(asset)) {
      throw new Error('Already saved')
    }

    await UpdateUserSavedAssets(hashedToken, asset)

    res.send()
  }
}
