import { Request, Response } from 'express'
import { GetDoesPostExistById } from 'modules/pages/asset/models/GET/GetDoesPostExistById'
import striptags from 'striptags'
import { GetAssetsByIdList } from '../models/GET/GetAssetsByIdList'
import { GetFeaturedAssets } from '../models/GET/GetFeaturedAssets'
import { UpdateAssetSetFeatured } from '../models/UPDATE/UpdateAssetSetFeatured'
import { UpdateFeaturedAssetsAdd } from '../models/UPDATE/UpdateFeaturedAssetsAdd'
import { UpdateFeaturedAssetsRemove } from '../models/UPDATE/UpdateFeaturedAssetsRemove'
import { UpdatePromobarMessage } from '../models/UPDATE/UpdatePromobarMessage'

export class AdminService {
  public async render (_req: Request, res: Response): Promise<void> {
    const pageBanner = {
      title: 'Site Settings',
      info: 'Manage site settings like promobar message and featured posts'
    }

    return res.render('templates/pages/admin/admin', { pageBanner: pageBanner })
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

    return res.render('templates/pages/admin/featured', { assets: assets, params: req.originalUrl, pageBanner: pageBanner })
  }

  public async updatePromobarMessage (req: Request, res: Response): Promise<void> {
    const message = striptags(req.body.message ?? '')

    if (message.length > 100) {
      throw new Error('Promobar message too long, must be less than 100 characters')
    }

    await UpdatePromobarMessage(message)

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
