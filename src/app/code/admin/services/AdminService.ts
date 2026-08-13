import { Request, Response } from 'express'
import { GetDoesPostExistById } from 'app/code/asset/models/GET/GetDoesPostExistById'
import striptags from 'striptags'
import { GetAssetsByIdList } from '../models/GET/GetAssetsByIdList'
import { GetReviewReportList } from '../models/GET/GetReviewReportList'
import { GetFeaturedAssets } from '../models/GET/GetFeaturedAssets'
import { GetSiteRestrictions } from '../models/GET/GetSiteRestrictions'
import { GetSiteFiles, SiteFileEntry } from '../models/GET/GetSiteFiles'
import { GetSiteHead } from '../models/GET/GetSiteHead'
import { UpdateAssetSetFeatured } from '../models/UPDATE/UpdateAssetSetFeatured'
import { UpdateFeaturedAssetsAdd } from '../models/UPDATE/UpdateFeaturedAssetsAdd'
import { UpdateFeaturedAssetsRemove } from '../models/UPDATE/UpdateFeaturedAssetsRemove'
import { UpdatePromobarMessage } from '../models/UPDATE/UpdatePromobarMessage'
import { UpdateSiteRestrictions } from '../models/UPDATE/UpdateSiteRestrictions'
import { UpdateSiteFiles } from '../models/UPDATE/UpdateSiteFiles'
import { UpdateSiteHead } from '../models/UPDATE/UpdateSiteHead'
import { invalidateSiteFileCache } from 'core/utils/siteFiles'
import { invalidateSiteHeadCache } from 'core/utils/siteHead'
import { invalidateAssetCache } from 'core/utils/dragonfly'
import { GetReviewsByIdList } from '../models/GET/GetReviewsByIdList'
import { UpdateReportIgnoreById } from '../models/UPDATE/UpdateReportIgnoreById'
import { GetReportById } from '../models/GET/GetReportById'
import { UpdateReportApproveById } from '../models/UPDATE/UpdateReportApproveById'
import { DeleteReviewById } from '../models/DELETE/DeleteReviewById'
import { GetReviewById } from '../models/GET/GetReviewById'
import { UpdatePositiveVotesRemoveOne } from 'app/code/asset/models/UPDATE/UpdatePositiveVotesRemoveOne'
import { UpdateNegativeVotesRemoveOne } from 'app/code/asset/models/UPDATE/UpdateNegativeVotesRemoveOne'
import { parsePagination } from 'core/utils/pagination'

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

    let siteFiles: SiteFileEntry[] = []
    try {
      siteFiles = await GetSiteFiles()
    } catch (e) {
      // ignore
    }

    let siteHead = ''
    try {
      siteHead = await GetSiteHead()
    } catch (e) {
      // ignore
    }

    return res.render('templates/pages/admin/admin', {
      pageBanner: pageBanner,
      siteRestrictions: siteRestrictions,
      siteFiles: siteFiles,
      siteHead: siteHead
    })
  }

  public async renderFeatured (req: Request, res: Response): Promise<void> {
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

    const featuredAssetList = await GetFeaturedAssets() ?? []
    const assets = await GetAssetsByIdList(featuredAssetList, limit, skip, sortMap[sort])

    const pageBanner = {
      title: 'Featured Assets',
      info: 'View all featured assets on the site'
    }

    return res.render('templates/pages/admin/featured', { grid: assets, params: req.originalUrl, pageBanner: pageBanner })
  }

  public async renderReports (req: Request, res: Response): Promise<void> {
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

    const reportedReviewList = await GetReviewReportList(limit, skip)
    const reportedReviewIdList: any[] = []

    reportedReviewList.forEach(report => {
      reportedReviewIdList.push(report.review_id)
    })

    const reviews = await GetReviewsByIdList(reportedReviewIdList, limit, 0)

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

  public async ignoreReport (req: Request, res: Response): Promise<void> {
    const reportId = striptags(req.params.id ?? '')

    if (reportId.length === 0) {
      throw new Error('Missing report ID')
    }

    await UpdateReportIgnoreById(reportId)

    res.send()
  }

  public async approveReport (req: Request, res: Response): Promise<void> {
    const reportId = striptags(req.params.id ?? '')

    if (reportId.length === 0) {
      throw new Error('Missing report ID')
    }

    const reportInfo = await GetReportById(reportId)
    const reviewInfo = await GetReviewById(reportInfo.review_id)

    if (reviewInfo.review_type === 'positive') {
      await UpdatePositiveVotesRemoveOne(reviewInfo.asset_id)
    } else {
      await UpdateNegativeVotesRemoveOne(reviewInfo.asset_id)
    }

    await UpdateReportApproveById(reportId)
    await DeleteReviewById(reportInfo.review_id)
    // The deleted review and adjusted counters are cached on the public asset
    // page; invalidate every major variant (and bump the asset epoch to fence
    // any in-flight loader) so the moderation is reflected immediately.
    await invalidateAssetCache(reviewInfo.asset_id)
    res.send()
  }

  public async updateSiteSettings (req: Request, res: Response): Promise<void> {
    const message = striptags(req.body.message ?? '', ['a', 'strong', 'span'])
    const disableNewAccounts = Boolean(req.body.disable_new_accounts ?? false)
    const disableNewComments = Boolean(req.body.disable_new_comments ?? false)

    // Site files arrive as parallel arrays of routes and contents; each row in
    // the admin form contributes one entry.
    const rawRoutes = req.body.site_file_route
    const rawContents = req.body.site_file_content
    const routes = Array.isArray(rawRoutes) ? rawRoutes : (rawRoutes === undefined ? [] : [rawRoutes])
    const contents = Array.isArray(rawContents) ? rawContents : (rawContents === undefined ? [] : [rawContents])

    if (routes.length > 50) {
      throw new Error('Too many site files, maximum is 50')
    }

    const siteFiles: SiteFileEntry[] = []
    for (let i = 0; i < routes.length; i++) {
      const route = String(routes[i] ?? '').replace(/^\/+/, '').trim()
      const content = String(contents[i] ?? '')
      if (route === '' || content.length === 0) {
        continue
      }
      if (route.length > 200) {
        throw new Error('Site file route too long, must be less than 200 characters')
      }
      // Allowlist instead of blocklist: letters, digits and a small set of
      // safe path characters. This rejects whitespace, ?/#, control characters
      // and anything else that could confuse routing.
      if (route.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(route)) {
        throw new Error(`Invalid site file route: ${route}`)
      }
      if (content.length > 10_000) {
        throw new Error('Site file content too long, must be less than 10000 characters per file')
      }
      siteFiles.push({ route, content })
    }

    if (message.length > 150) {
      throw new Error('Promobar message too long, must be less than 150 characters')
    }

    // Admin-configured HTML fragment injected into the <head> of every public
    // page. Stored and injected as-is — this is trusted site-operator markup
    // (meta/link/script/schema.org), so no sanitization strips script tags.
    const siteHead = String(req.body.site_head ?? '').trim()
    if (siteHead.length > 20_000) {
      throw new Error('Custom head elements too long, must be less than 20000 characters')
    }

    await UpdatePromobarMessage(message)
    await UpdateSiteRestrictions(disableNewAccounts, disableNewComments)
    await UpdateSiteFiles(siteFiles)
    await UpdateSiteHead(siteHead)

    // Drop the in-memory caches so the public routes pick up the new content
    // immediately instead of waiting out the TTL (and broadcast so every
    // worker invalidates, not just the one that handled the request).
    invalidateSiteFileCache()
    invalidateSiteHeadCache()

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
