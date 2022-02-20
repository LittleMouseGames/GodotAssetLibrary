import { Request, Response } from 'express'

export class AdminService {
  public async render (_req: Request, res: Response): Promise<void> {
    const pageBanner = {
      title: 'Site Settings',
      info: 'Manage site settings like promobar message and featured posts'
    }

    return res.render('templates/pages/admin/admin', { pageBanner: pageBanner })
  }
}
