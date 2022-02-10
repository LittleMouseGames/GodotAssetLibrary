import { Request, Response } from 'express'

export class TermsService {
  /**
   * Account registration
   *
   * @param {Request} req request object
  */
  public render (_req: Request, res: Response): void {
    return res.render('templates/pages/terms/privacy-policy')
  }

  public renderPrivacyPolicy (_req: Request, res: Response): void {
    return res.render('templates/pages/terms/privacy-policy')
  }

  public renderTermsOfService (_req: Request, res: Response): void {
    return res.render('templates/pages/terms/terms-of-service')
  }

  public renderCookiePolicy (_req: Request, res: Response): void {
    return res.render('templates/pages/terms/cookie-policy')
  }

  public renderAcceptableUsePolicy (_req: Request, res: Response): void {
    return res.render('templates/pages/terms/acceptable-use-policy')
  }
}
