import { Request, Response } from 'express'
import { GetDoesPostExistById } from 'modules/pages/asset/models/GET/GetDoesPostExistById'
import striptags from 'striptags'
import { GetFeaturedAssets } from '../models/GET/GetFeaturedAssets'
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
      } else {
        await UpdateFeaturedAssetsAdd(asset)
      }
    } catch (e) {
      await UpdateFeaturedAssetsAdd(asset)
    }

    res.send()
  }
}
