import * as controllers from 'core/controllers.index'
import { Server } from '@overnightjs/core'
import express, { NextFunction, Request, Response } from 'express'
import { logger } from 'core/utils/logger'
import compression from 'compression'
import path from 'path'
import cookieParser from 'cookie-parser'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserContextByToken } from 'core/modules/authentication/models/user/GET/GetUserContextByToken'
import { GetPromobarMessage } from 'app/code/admin/models/GET/GetPromobarMesasge'
import { StatusCodes } from 'http-status-codes'
import { generateProxyUrl } from 'core/utils/generateProxyUrl'
import { buildAssetUrl, buildAssetUrlWithReturn } from 'core/utils/assetUrl'
require('express-async-errors')

let promoCachedMessage: string | null = null
let promoCacheExpiresAt = 0
let promoRefresh: Promise<void> | null = null
const PROMO_TTL_MS = 60_000
const parsedMaxRequests = Number.parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? '', 10)
const MAX_CONCURRENT_REQUESTS = Number.isFinite(parsedMaxRequests) && parsedMaxRequests > 0 ? parsedMaxRequests : 100
let activeRequests = 0

function refreshPromoMessage (): void {
  if (promoRefresh !== null) {
    return
  }

  promoRefresh = GetPromobarMessage().then(message => {
    promoCachedMessage = message
  }).catch(() => {
    // Keep serving the stale value when the database is temporarily unavailable.
  }).finally(() => {
    promoRefresh = null
  })
}

/**
 * Starts the server
 */
class RouterServer extends Server {
  private readonly FRONT_END_MSG = 'Unable to route. If you\'re seeing this message its almost definitely a mistake'

  /**
   * Sets up our dependencies
   */
  constructor () {
    super(true)

    const buildString = new Date().getTime().toString()

    this.app.disable('x-powered-by')
    this.app.set('view engine', 'eta')
    this.app.set('views', path.join(__dirname, '/'))
    this.app.set('trust proxy', 1)
    this.app.use(compression())
    this.app.use(express.static(path.join(__dirname, 'public')))
    this.app.use(express.json())
    this.app.use(cookieParser())
    this.app.use(express.urlencoded({
      extended: true
    }))

    // CSRF defense-in-depth for state-changing requests. SameSite=Lax cookies
    // already block most cross-site posts; this also rejects requests that
    // send a mismatched Origin/Referer (e.g. older browsers or forms).
    //
    // The expected origin is derived from the request's own Host (behind the
    // trusted proxy), not from PROJECT_BASE_URL, which is the production
    // canonical host and would wrongly block local/dev origins.
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        next()
        return
      }

      const origin = req.headers.origin
      const referer = req.headers.referer
      const expectedHost = `${req.protocol}://${req.get('host')}`

      const matchesHost = (value: string | undefined): boolean => {
        if (value === undefined || value === '') return false
        try {
          const url = new URL(value)
          const expected = new URL(expectedHost)
          return url.hostname === expected.hostname && url.port === expected.port
        } catch {
          return false
        }
      }

      // Native/API clients may omit both headers entirely; but if either is
      // present it must belong to this site.
      if (origin !== undefined || referer !== undefined) {
        if (!matchesHost(origin) && !matchesHost(referer)) {
          res.status(StatusCodes.FORBIDDEN).send({ error: 'Cross-site request blocked' })
          return
        }
      }

      next()
    })

    // health check bypasses all database middleware
    this.app.get('/health', (_req: Request, res: Response) => {
      res.send('OK')
    })

    // Bound request state retained during traffic spikes or database pressure.
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        res.setHeader('Retry-After', '1')
        res.status(StatusCodes.SERVICE_UNAVAILABLE).send({ error: 'Server is busy, please try again shortly' })
        return
      }

      activeRequests++
      let released = false
      const release = (): void => {
        if (!released) {
          released = true
          activeRequests--
        }
      }
      res.once('finish', release)
      res.once('close', release)
      next()
    })

    /**
     * Inject into all routes _locals space
     */
    this.app.use(async function (req: Request, res: Response, next: NextFunction) {
      const authToken = req.cookies['auth-token'] ?? ''
      res.locals.loggedIn = false

      if (authToken !== '') {
        const tokenServices = TokenServices.getInstance()
        const hashedToken = tokenServices.hashToken(authToken)

        try {
          const user = await GetUserContextByToken(hashedToken)
          res.locals.loggedIn = user.loggedIn
          res.locals.role = user.role
        } catch (e) {
          // ignore
        }
      }

      const now = Date.now()
      if (promoCacheExpiresAt > now) {
        res.locals.promobarMessage = promoCachedMessage
      } else {
        promoCacheExpiresAt = now + PROMO_TTL_MS
        refreshPromoMessage()
        res.locals.promobarMessage = promoCachedMessage
      }

      res.locals.functions = {
        generateProxyUrl: generateProxyUrl,
        buildAssetUrl: buildAssetUrl,
        buildAssetUrlWithReturn: buildAssetUrlWithReturn
      }

      res.locals.buildString = buildString

      next()
    })

    // Account pages and auth endpoints carry personal data; never cache them.
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/dashboard') || req.path.startsWith('/api/users')) {
        res.set('Cache-Control', 'no-store')
      }
      next()
    })

    this.setupControllers()

    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.log('error', err.message, [err])

      // Explicit status codes (e.g. BadRequestError) are honored; anything
      // else is a server error, not a client error.
      const statusCode = (err as any).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR

      const wantsHtml = req.accepts(['html', 'json']) === 'html' && !req.path.startsWith('/api/')
      if (wantsHtml) {
        return res.status(statusCode).render('templates/pages/lost/server-error', {
          pageBanner: {
            title: 'Something went wrong',
            info: 'Sorry, we\'re having issues loading this page right now'
          }
        })
      }
      // Never leak internal error details on 5xx responses; keep the detailed
      // message only for explicit 4xx errors (e.g. BadRequestError).
      const message = statusCode >= 500 ? 'Internal server error' : err.message
      return res.status(statusCode).send({ error: message })
    })
  }

  /**
   * Load all controllers
   */
  private setupControllers (): void {
    const controllerInstances = []
    for (const name of Object.keys(controllers)) {
      const Controller = (controllers as any)[name]
      if (typeof Controller === 'function') {
        controllerInstances.push(new Controller())
      }
    }
    super.addControllers(controllerInstances)
  }

  /**
   * Start the express server
   *
   * @param port {Number} declare the server port
   */
  public start (port: number): void {
    this.app.get('*', (req: Request, res: Response) => {
      // Unmatched routes are real 404s, not redirects, so crawlers and users
      // see the correct status. The /lost page renders inside the normal shell.
      if (req.path !== '/lost') {
        return res.status(StatusCodes.NOT_FOUND).render('templates/pages/lost/not-found', {
          pageBanner: {
            title: 'Page not found',
            info: 'The page you were looking for doesn\'t exist'
          }
        })
      }
      return res.status(StatusCodes.NOT_FOUND).render('templates/pages/lost/not-found', {
        pageBanner: {
          title: 'Page not found',
          info: 'The page you were looking for doesn\'t exist'
        }
      })
    })

    this.app.listen(port, () => {
      logger.log('info', `Running on port: ${port}`)
    })
  }
}

export default RouterServer
