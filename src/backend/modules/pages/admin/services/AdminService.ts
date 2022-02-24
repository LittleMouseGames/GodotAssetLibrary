import { Request, Response } from 'express'
import { GetDoesPostExistById } from 'modules/pages/asset/models/GET/GetDoesPostExistById'
import striptags from 'striptags'
import { GetAssetsByIdList } from '../models/GET/GetAssetsByIdList'
import { GetReviewReportList } from '../models/GET/GetReviewReportList'
import { GetFeaturedAssets } from '../models/GET/GetFeaturedAssets'
import { GetSiteRestrictions } from '../models/GET/GetSiteRestrictions'
import { UpdateAssetSetFeatured } from '../models/UPDATE/UpdateAssetSetFeatured'
import { UpdateFeaturedAssetsAdd } from '../models/UPDATE/UpdateFeaturedAssetsAdd'
import { UpdateFeaturedAssetsRemove } from '../models/UPDATE/UpdateFeaturedAssetsRemove'
import { UpdatePromobarMessage } from '../models/UPDATE/UpdatePromobarMessage'
import { UpdateSiteRestrictions } from '../models/UPDATE/UpdateSiteRestrictions'
import { GetReviewsByIdList } from '../models/GET/GetReviewsByIdList'

export class AdminService {
  public async render (_req: Request, res: Response): Promise<void> {
    const pageBanner = {
      title: 'Site Settings',
      info: 'Manage site settings like promobar message and featured posts'
    }

    let siteRestrictions = {}
    try {
      siteRestrictions = await GetSiteRestrictions()
    } catch (e) {
      // ignore
    }

    return res.render('templates/pages/admin/admin', { pageBanner: pageBanner, siteRestrictions: siteRestrictions })
  }

  public async renderFeatured (req: Request, res: Response): Promise<void> {
    let limit = Number(req.query.limit ?? 12)
    const page = Number(req.query.page ?? 0)

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page

    const featuredAssetList = await GetFeaturedAssets() ?? []
    const assets = await GetAssetsByIdList(featuredAssetList, limit, skip)

    const pageBanner = {
      title: 'Featured Assets',
      info: 'View all featured assets on the site'
    }

    return res.render('templates/pages/admin/featured', { grid: assets, params: req.originalUrl, pageBanner: pageBanner })
  }

  public async renderReports (req: Request, res: Response): Promise<void> {
    let limit = Number(req.query.limit ?? 12)
    const page = Number(req.query.page ?? 0)

    if (limit > 36) {
      limit = 36
    }

    const skip = limit * page

    const reportedReviewList = await GetReviewReportList(limit, skip)
    const reportedReviewIdList: any[] = []

    reportedReviewList.forEach(report => {
      reportedReviewIdList.push(report.review_id)
    })

    const reviews = await GetReviewsByIdList(reportedReviewIdList, limit, skip)

    const reviewAndReportCombined: Array<{ [key: string]: { [key: string]: string } }> = []

    reportedReviewList.forEach(report => {
      const combinedObject: {[key: string]: {[key: string]: string} } = {}

      const reportedReview = reviews.find(review => review.human_id === report.review_id)

      combinedObject.report = {
        reason: report.reason,
        notes: report.notes,
        report_id: report.human_id
      }

      combinedObject.review = {
        username: reportedReview?.username,
        review_type: reportedReview?.review_type,
        headline: reportedReview?.headline,
        text: reportedReview?.text,
        review_id: reportedReview?.human_id
      }

      reviewAndReportCombined.push(combinedObject)
    })

    const pageBanner = {
      title: 'Reported Reviews',
      info: 'View all reported reviews'
    }

    return res.render('templates/pages/admin/view-reports', { grid: reviewAndReportCombined, params: req.originalUrl, pageBanner: pageBanner, type: 'reports' })
  }

  public async updateSiteSettings (req: Request, res: Response): Promise<void> {
    const message = striptags(req.body.message ?? '')
    const disableNewAccounts = Boolean(req.body.disable_new_accounts ?? false)
    const disableNewComments = Boolean(req.body.disable_new_comments ?? false)

    if (message.length > 100) {
      throw new Error('Promobar message too long, must be less than 100 characters')
    }

    await UpdatePromobarMessage(message)
    await UpdateSiteRestrictions(disableNewAccounts, disableNewComments)

    res.send()
  }

  public async featureAsset (req: Request, res: Response): Promise<void> {
    const asset = striptags(req.params.id ?? '')

    if (asset === '') {
      throw new Error('Missing asset id')
    }

    if (!(await GetDoesPostExistById(asset))) {
      throw new Error('Asset not found')
    }

    try {
      const featuredAssets = await GetFeaturedAssets()

      if (featuredAssets?.includes(asset)) {
        await UpdateFeaturedAssetsRemove(asset)
        await UpdateAssetSetFeatured(asset, false)
      } else {
        await UpdateFeaturedAssetsAdd(asset)
        await UpdateAssetSetFeatured(asset, true)
      }
    } catch (e) {
      await UpdateFeaturedAssetsAdd(asset)
      await UpdateAssetSetFeatured(asset, true)
    }

    res.send()
  }
}
