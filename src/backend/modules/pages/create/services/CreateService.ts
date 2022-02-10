import { Request, Response } from 'express'

export class CreateService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public render (_req: Request, res: Response): void {
    return res.render('templates/pages/create/create')
  }
}
