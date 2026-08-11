import { Request, Response } from 'express'
import { GetDoesUsernameExist } from 'core/modules/authentication/models/user/GET/GetDoesUsernameExist'
import { GetIsUsernameReserved } from 'core/modules/authentication/models/user/GET/GetIsUsernameReserved'
import { GetPasswordHashByToken } from 'core/modules/authentication/models/user/GET/GetPasswordHashByToken'
import { GetUserIdByToken } from 'core/modules/authentication/models/user/GET/GetUserIdByToken'
import { UpdatePasswordHashByToken } from 'core/modules/authentication/models/user/UPDATE/UpdatePasswordHashByToken'
import { UserServices } from 'core/modules/authentication/services/UserServices'
import { GetDoesPostExistById } from 'app/code/asset/models/GET/GetDoesPostExistById'
import { GetUserAssetsFromQuery } from '../models/GET/GetUserAssetsFromQuery'
import { GetUserSavedAssets } from '../models/GET/GetUserSavedAssets'
import { GetUserInfoByToken } from '../models/GET/GetUserInfoByToken'
import { GetUserReviewsByToken, UserReviewRow } from '../models/GET/GetUserReviewsByToken'
import { UpdateUserInformtaion } from '../models/UPDATE/UpateUserInformation'
import { UpdateReviewsInformationByUserId } from '../models/UPDATE/UpdateReviewsInformationByUserId'
import { UpdateUserSavedAssetsAdd } from '../models/UPDATE/UpdateUserSavedAssetsAdd'
import striptags from 'striptags'
import { UpdateUserSavedAssetsRemove } from '../models/UPDATE/UpdateUserSavedAssetsRemove'
import { GetAllUserInformation } from '../models/GET/GetAllUserInformation'
import { GetAllUserComments } from '../models/GET/GetAllUserComments'
import { DeleteUserByUserId } from '../models/DELETE/DeleteUserById'
import { GetUsernameByToken } from 'core/modules/authentication/models/user/GET/GetUsernameByToken'
import { parsePagination } from 'core/utils/pagination'
import { BadRequestError } from 'core/utils/httpError'
import { attachCardExtras } from 'core/utils/cardView'
import { DeleteUserReviewsAndAdjustVotes } from '../models/DELETE/DeleteUserReviewsAndAdjustVotes'

async function writeResponseChunk (res: Response, chunk: string): Promise<void> {
  if (res.write(chunk)) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      res.off('drain', onDrain)
      res.off('close', onClose)
      res.off('error', onError)
    }
    const onDrain = (): void => {
      cleanup()
      resolve()
    }
    const onClose = (): void => {
      cleanup()
      reject(new Error('Client disconnected during account export'))
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }

    res.once('drain', onDrain)
    res.once('close', onClose)
    res.once('error', onError)
  })
}

export class DashboardService {
  public async render (req: Request, res: Response): Promise<void> {
    const info = await GetUserInfoByToken(req.body.hashedToken)

    const pageBanner = {
      title: 'Account Information',
      info: 'Manage your account information, including username and password'
    }

    return res.render('templates/pages/dashboard/dashboard', { info: info, pageBanner: pageBanner, sidebarActive: 'account' })
  }

  public async renderReviews (req: Request, res: Response): Promise<void> {
    const { limit, skip } = parsePagination(req.query.limit, req.query.page)
    const hashedToken = striptags(req.body.hashedToken ?? '')

    if (hashedToken === '') {
      throw new BadRequestError('Missing user auth')
    }

    // Canonical reviews (not the embedded reviewed_assets array) are the
    // source of truth for what a user has rated.
    const userId = await GetUserIdByToken(hashedToken)
    const { rows, total } = await GetUserReviewsByToken(userId, limit, skip)

    const assetIds = rows.map(row => row.asset_id)
    let reviewItems: Array<{ review: UserReviewRow, asset: any }> = []

    if (assetIds.length > 0) {
      const assets = await GetUserAssetsFromQuery(limit, 0, assetIds as [string], {})
      attachCardExtras(assets)
      const byId = new Map(assets.map(asset => [asset.asset_id, asset]))
      reviewItems = rows
        .map(review => ({ review, asset: byId.get(review.asset_id) }))
        .filter((item): item is { review: UserReviewRow, asset: any } => item.asset !== undefined)
    }

    const pageBanner = {
      title: 'Ratings & reviews',
      info: 'Your ratings and written reviews on assets'
    }

    return res.render('templates/pages/dashboard/reviews', {
      reviewItems,
      gridTotal: total,
      params: req.originalUrl,
      pageBanner,
      sidebarActive: 'reviews'
    })
  }

  public async renderManage (_req: Request, res: Response): Promise<void> {
    const pageBanner = {
      title: 'Manage Information',
      info: 'Download your information or delete your account'
    }

    return res.render('templates/pages/dashboard/manage', { pageBanner: pageBanner, sidebarActive: 'manage' })
  }

  public async renderSaved (req: Request, res: Response): Promise<void> {
    const { limit, skip } = parsePagination(req.query.limit, req.query.page)
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

    const savedAssetList = await GetUserSavedAssets(req.body.hashedToken) ?? []
    const { assets, total } = await this.loadPagedUserAssets(savedAssetList, limit, skip)

    const pageBanner = {
      title: 'Saved Assets',
      info: 'View all assets you\'ve saved'
    }

    return res.render('templates/pages/dashboard/reviews', {
      grid: assets,
      gridTotal: total,
      params: req.originalUrl,
      pageBanner: pageBanner,
      sidebarActive: 'saved'
    })
  }

  /**
   * Slice the user's asset-id list for the current page, fetch those assets,
   * and restore the user's stored order (embedded arrays have no order in
   * Mongo's $in result). Returns the page plus the accurate total for
   * pagination.
   */
  private async loadPagedUserAssets (assetIds: string[], limit: number, skip: number): Promise<{ assets: any[], total: number }> {
    const pageIds = assetIds.slice(skip, skip + limit)
    if (pageIds.length === 0) return { assets: [], total: assetIds.length }

    const found = await GetUserAssetsFromQuery(limit, 0, pageIds as [string], {})
    attachCardExtras(found)
    const byId = new Map(found.map(asset => [asset.asset_id, asset]))
    const ordered = pageIds
      .map(id => byId.get(id))
      .filter((asset): asset is any => asset !== undefined)

    return { assets: ordered, total: assetIds.length }
  }

  public async updateInfo (req: Request, res: Response): Promise<void> {
    const username = striptags(req.body.username ?? '')
    const email = striptags(req.body.email ?? '')
    const hashedToken = striptags(req.body.hashedToken ?? '')

    if (username === '' || email === '' || hashedToken === '') {
      throw new BadRequestError('Missing required username or email')
    }

    const UserService = UserServices.getInstance()

    if (!UserService.isUsernameValid(username)) {
      throw new BadRequestError('Username isn\'t valid')
    }

    if (await GetDoesUsernameExist(username) && await GetUsernameByToken(hashedToken) !== username) {
      throw new BadRequestError('Username already in use')
    }

    if (await GetIsUsernameReserved(username)) {
      throw new BadRequestError('Username is reserved since its used on an asset thats been imported. If this username and those assets belong to you, please reach out so that you can claim this username.')
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
      throw new BadRequestError('Missing required current password or new password')
    }

    if (newPassword !== newPasswordConf) {
      throw new BadRequestError('Password mis-match')
    }

    const UserService = UserServices.getInstance()

    if (!UserService.isPasswordValid(newPassword)) {
      throw new BadRequestError('Password doesn\'t meet requirements')
    }

    const currentPasswordHash = await GetPasswordHashByToken(hashedToken)

    if (!(await UserService.doesPasswordMatchHash(currentPasswordHash, currentPassword))) {
      throw new BadRequestError('Incorrect password')
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
      throw new BadRequestError('Missing user auth')
    }

    if (asset === '') {
      throw new BadRequestError('Missing asset id')
    }

    if (!(await GetDoesPostExistById(asset))) {
      throw new BadRequestError('Asset not found')
    }

    const userSaved = await GetUserSavedAssets(hashedToken)

    if (userSaved?.includes(asset)) {
      await UpdateUserSavedAssetsRemove(hashedToken, asset)
    } else {
      await UpdateUserSavedAssetsAdd(hashedToken, asset)
    }

    res.send()
  }

  public async setSavedAsset (req: Request, res: Response): Promise<void> {
    const asset = striptags(req.params.id ?? '')
    const hashedToken = striptags(req.body.hashedToken ?? '')

    if (hashedToken === '') {
      throw new BadRequestError('Missing user auth')
    }

    if (asset === '') {
      throw new BadRequestError('Missing asset id')
    }

    if (!(await GetDoesPostExistById(asset))) {
      throw new BadRequestError('Asset not found')
    }

    // Explicit desired state, so retries cannot accidentally reverse it.
    const desired = req.body.saved === true || req.body.saved === 'true'
    const userSaved = await GetUserSavedAssets(hashedToken)
    const isSaved = userSaved?.includes(asset) ?? false

    if (desired && !isSaved) {
      await UpdateUserSavedAssetsAdd(hashedToken, asset)
    } else if (!desired && isSaved) {
      await UpdateUserSavedAssetsRemove(hashedToken, asset)
    }

    res.send({ assetId: asset, saved: desired })
  }

  public async downloadInformation (req: Request, res: Response): Promise<void> {
    const hashedToken = striptags(req.body.hashedToken ?? '')

    if (hashedToken === '') {
      throw new BadRequestError('Missing user auth')
    }

    const userObject = await GetAllUserInformation(hashedToken)
    const userId = await GetUserIdByToken(hashedToken)
    const userComments = GetAllUserComments(userId)

    res.status(200)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="account-data.json"')
    await writeResponseChunk(res, `{"user_object":${JSON.stringify(userObject)},"user_comments":[`)

    let first = true
    try {
      for await (const comment of userComments) {
        await writeResponseChunk(res, `${first ? '' : ','}${JSON.stringify(comment)}`)
        first = false
      }
    } finally {
      await userComments.close()
    }

    res.end(']}')
  }

  public async deleteAccount (req: Request, res: Response): Promise<void> {
    const hashedToken = striptags(req.body.hashedToken ?? '')
    const password = striptags(req.body.password ?? '')
    const confirmation = striptags(req.body.confirm ?? '')

    if (hashedToken === '') {
      throw new BadRequestError('Missing user auth')
    }

    if (password === '') {
      throw new BadRequestError('Enter your current password to delete your account')
    }

    if (confirmation !== 'DELETE') {
      throw new BadRequestError('Type DELETE to confirm account deletion')
    }

    const passwordHash = await GetPasswordHashByToken(hashedToken)
    const valid = await UserServices.getInstance().doesPasswordMatchHash(passwordHash, password)
    if (!valid) {
      throw new BadRequestError('Incorrect password')
    }

    const userId = await GetUserIdByToken(hashedToken)
    await DeleteUserReviewsAndAdjustVotes(userId)
    await DeleteUserByUserId(userId)

    res.clearCookie('auth-token')
    res.redirect('/')
  }
}
