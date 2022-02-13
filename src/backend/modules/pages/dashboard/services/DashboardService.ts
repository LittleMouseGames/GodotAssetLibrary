import { Request, Response } from 'express'
import { GetUserInfoByToken } from '../models/GET/GetUserInfoByToken'

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
}
