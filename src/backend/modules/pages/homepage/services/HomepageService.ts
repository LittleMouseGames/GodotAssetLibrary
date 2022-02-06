import { Request, Response } from 'express'

export class HomepageService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public render (_req: Request, res: Response): void {
    return res.render('pages/homepage/index')
  }
}
