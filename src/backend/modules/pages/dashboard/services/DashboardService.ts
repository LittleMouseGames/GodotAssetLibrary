import { Request, Response } from 'express'
import { GetDoesUsernameExist } from 'modules/common/authentication/models/user/GET/GetDoesUsernameExist'
import { GetIsUsernameReserved } from 'modules/common/authentication/models/user/GET/GetIsUsernameReserved'
import { GetPasswordHashByToken } from 'modules/common/authentication/models/user/GET/GetPasswordHashByToken'
import { GetUserIdByToken } from 'modules/common/authentication/models/user/GET/GetUserIdByToken'
import { UpdatePasswordHashByToken } from 'modules/common/authentication/models/user/UPDATE/UpdatePasswordHashByToken'
import { UserServices } from 'modules/common/authentication/services/UserServices'
import { GetDoesPostExistById } from 'modules/pages/asset/models/GET/GetDoesPostExistById'
import { GetUserAssetsFromQuery } from '../models/GET/GetUserAssetsFromQuery'
import { GetUserSavedAssets } from '../models/GET/GetUserSavedAssets'
import { GetUserInfoByToken } from '../models/GET/GetUserInfoByToken'
import { GetUserReviewedAssets } from '../models/GET/GetUserReviewedAssets'
import { UpdateUserInformtaion } from '../models/UPDATE/UpateUserInformation'
import { UpdateReviewsInformationByUserId } from '../models/UPDATE/UpdateReviewsInformationByUserId'
import { UpdateUserSavedAssetsAdd } from '../models/UPDATE/UpdateUserSavedAssetsAdd'
import striptags from 'striptags'
import { UpdateUserSavedAssetsRemove } from '../models/UPDATE/UpdateUserSavedAssetsRemove'
import { GetAllUserInformation } from '../models/GET/GetAllUserInformation'
import { GetAllUserComments } from '../models/GET/GetAllUserComments'
import { UpdatePositiveVotesRemoveOne } from 'modules/pages/asset/models/UPDATE/UpdatePositiveVotesRemoveOne'
import { UpdateNegativeVotesRemoveOne } from 'modules/pages/asset/models/UPDATE/UpdateNegativeVotesRemoveOne'
import { DeleteAllUserComments } from '../models/DELETE/DeleteAllUserComments copy'
import { DeleteUserByUserId } from '../models/DELETE/DeleteUserById'
import { GetUsernameByToken } from 'modules/common/authentication/models/user/GET/GetUsernameByToken'

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
    const sort = striptags(String(req.query.sort ?? 'relevance'))
    const sortMap: {[key: string]: any} = {
      relevance: {},
      asset_rating: { upvotes: -1 },
      newest: { added_date: -1 },
      last_modified: { modify_date: -1 }
    }

    if (sort !== 'undefined' && !(sort in sortMap)) {
      throw new Error('Invalid sort parameter, expeting nothing, `relevance`, `rating`, `newest`, or `last_modified`')
    }

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page

    const reviewedAssetList = await GetUserReviewedAssets(req.body.hashedToken)
    const assets = await GetUserAssetsFromQuery(limit, skip, reviewedAssetList, sortMap[sort])

    const pageBanner = {
      title: 'Reviewed Assets',
      info: 'View all assets you\'ve left reviews on'
    }

    try {
      const userSaved = await GetUserSavedAssets(req.body.hashedToken)

      for (const asset of assets) {
        asset.saved = userSaved.includes(asset.asset_id)
      }
    } catch (e) {
      // ignore
    }

    return res.render('templates/pages/dashboard/reviews', { grid: assets, params: req.originalUrl, pageBanner: pageBanner })
  }

  public async renderManage (_req: Request, res: Response): Promise<void> {
    const pageBanner = {
      title: 'Manage Information',
      info: 'Download your information or delete your account'
    }

    return res.render('templates/pages/dashboard/manage', { pageBanner: pageBanner })
  }

  public async renderSaved (req: Request, res: Response): Promise<void> {
    let limit = Number(req.query.limit ?? 12)
    const page = Number(req.query.page ?? 0)
    const sort = striptags(String(req.query.sort ?? 'relevance'))
    const sortMap: {[key: string]: any} = {
      relevance: {},
      asset_rating: { upvotes: -1 },
      newest: { added_date: -1 },
      last_modified: { modify_date: -1 }
    }

    if (sort !== 'undefined' && !(sort in sortMap)) {
      throw new Error('Invalid sort parameter, expeting nothing, `relevance`, `rating`, `newest`, or `last_modified`')
    }

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page

    const reviewedAssetList = await GetUserSavedAssets(req.body.hashedToken) ?? []
    const assets = await GetUserAssetsFromQuery(limit, skip, reviewedAssetList, sortMap[sort])

    try {
      const userSaved = await GetUserSavedAssets(req.body.hashedToken)

      for (const asset of assets) {
        asset.saved = userSaved.includes(asset.asset_id)
      }
    } catch (e) {
      // ignore
    }

    const pageBanner = {
      title: 'Saved Assets',
      info: 'View all assets you\'ve saved'
    }

    return res.render('templates/pages/dashboard/reviews', { grid: assets, params: req.originalUrl, pageBanner: pageBanner })
  }

  public async updateInfo (req: Request, res: Response): Promise<void> {
    const username = striptags(req.body.username ?? '')
    const email = striptags(req.body.email ?? '')
    const hashedToken = striptags(req.body.hashedToken ?? '')

    if (username === '' || email === '' || hashedToken === '') {
      throw new Error('Missing required username or email')
    }

    const UserService = UserServices.getInstance()

    if (!UserService.isUsernameValid(username)) {
      throw new Error('Username isn\'t valid')
    }

    if (await GetDoesUsernameExist(username) && await GetUsernameByToken(hashedToken) !== username) {
      throw new Error('Username already in use')
    }

    if (await GetIsUsernameReserved(username)) {
      throw new Error('Username is reserved since its used on an asset thats been imported. If this username and those assets belong to you, please reach out so that you can claim this username.')
    }

    const userId = await GetUserIdByToken(hashedToken)

    await UpdateUserInformtaion(hashedToken, username, email)
    await UpdateReviewsInformationByUserId(userId, username)

    const info = await GetUserInfoByToken(req.body.hashedToken)
    return res.render('templates/pages/dashboard/dashboard', { info: info })
  }

  public async updatePassword (req: Request, res: Response): Promise<void> {
    const currentPassword = striptags(req.body['password-current'] ?? '')
    const newPassword = striptags(req.body['new-password'] ?? '')
    const newPasswordConf = striptags(req.body['new-password-conf'] ?? '')
    const hashedToken = striptags(req.body.hashedToken ?? '')

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
    const asset = striptags(req.params.id ?? '')
    const hashedToken = striptags(req.body.hashedToken ?? '')

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
      await UpdateUserSavedAssetsRemove(hashedToken, asset)
    } else {
      await UpdateUserSavedAssetsAdd(hashedToken, asset)
    }

    res.send()
  }

  public async downloadInformation (req: Request, res: Response): Promise<void> {
    const hashedToken = striptags(req.body.hashedToken ?? '')

    if (hashedToken === '') {
      throw new Error('Missing user auth')
    }

    const userObject = await GetAllUserInformation(hashedToken)
    const userId = await GetUserIdByToken(hashedToken)
    const userComments = await GetAllUserComments(userId)

    const downloadObject = {
      user_object: userObject,
      user_comments: userComments
    }

    const downloadJson = JSON.stringify(downloadObject)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(downloadJson, 'ascii')
  }

  public async deleteAccount (req: Request, res: Response): Promise<void> {
    const hashedToken = striptags(req.body.hashedToken ?? '')

    if (hashedToken === '') {
      throw new Error('Missing user auth')
    }

    const userId = await GetUserIdByToken(hashedToken)
    const userComments = await GetAllUserComments(userId)

    for (const comment of userComments) {
      if (comment.review_type === 'positive') {
        await UpdatePositiveVotesRemoveOne(comment.asset_id)
      } else {
        await UpdateNegativeVotesRemoveOne(comment.asset_id)
      }
    }

    await DeleteAllUserComments(userId)
    await DeleteUserByUserId(userId)

    res.clearCookie('auth-token')
    res.redirect('/')
  }
}
