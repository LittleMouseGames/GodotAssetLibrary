import { Request, Response } from 'express'

export class CreateService {
  /**
   * Render new asset index
   *
   * @param {Request} _req
   * @param {Response} res
   * @returns
   */
  public render (_req: Request, res: Response): void {
    return res.redirect('/')
    // return res.render('templates/pages/create/create')
  }
}
