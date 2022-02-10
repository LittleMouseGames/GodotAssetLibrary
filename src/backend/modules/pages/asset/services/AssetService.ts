import { Request, Response } from 'express'

export class AssetService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public render (_req: Request, res: Response): void {
    return res.render('templates/pages/asset/view')
  }
}
