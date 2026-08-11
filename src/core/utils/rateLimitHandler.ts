import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

/**
 * express-rate-limit handler that renders a navigable 429 page for normal
 * browsing requests and keeps structured JSON for API/mutation requests.
 */
export function rateLimitHandler (message: string) {
  return (req: Request, res: Response): void => {
    const wantsHtml = req.accepts(['html', 'json']) === 'html' && !req.path.startsWith('/api/')
    res.set('Cache-Control', 'no-store')
    res.set('X-Robots-Tag', 'noindex, nofollow')
    res.set('Retry-After', '900')
    if (wantsHtml) {
      res.status(StatusCodes.TOO_MANY_REQUESTS).render('templates/pages/lost/server-error', {
        pageBanner: {
          title: 'Too many requests',
          info: 'You\'re doing that too much, please try again later'
        }
      })
      return
    }
    res.status(StatusCodes.TOO_MANY_REQUESTS).send({ error: message })
  }
}
