import { Request, Response } from 'express'

/**
 * "We have to go back!"
 * - Jack Shepard, Lost
 */
export class LostService {
  public render (_req: Request, res: Response): void {
    const lostMessages = [
      '<i>"We have to go back!"</i> - Jack Shepard, Lost',
      '<i>"This is not the page you are looking for"</i> - Some guy from Starwars'
    ]

    const pageBanner = {
      title: '404 - Page Not Found',
      info: lostMessages[Math.floor(Math.random() * lostMessages.length)]
    }

    return res.render('templates/pages/lost/not-found', { pageBanner: pageBanner })
  }
}
