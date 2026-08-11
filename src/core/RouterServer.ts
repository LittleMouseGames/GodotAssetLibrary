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
import { getSiteFileContent } from 'core/utils/siteFiles'
import { generateProxyUrl } from 'core/utils/generateProxyUrl'
import { buildAssetUrl, buildAssetUrlWithReturn } from 'core/utils/assetUrl'
import { buildCategoryPath, buildEnginePath } from 'core/utils/taxonomyUrl'
import { safeJsonLd } from 'core/utils/jsonLd'
import * as telemetry from 'core/utils/telemetry'
require('express-async-errors')

let promoCachedMessage: string | null = null
let promoCacheExpiresAt = 0
let promoRefresh: Promise<void> | null = null
const PROMO_TTL_MS = 60_000

// Cap on in-flight dynamic HTTP requests (process-wide). This is the "Server
// is busy" 503 backstop, and it was the actual cause of the prod 503s: at
// ~46 req/s (120M/month) a cap of 100 saturates whenever the average request
// takes more than ~2.2s, which bursts easily reach while crawling. Raised to
// 500 in tandem with the search fan-out consolidation (6 -> 2 Mongo ops per
// request) and the MONGO_MAX_POOL bump, so worst-case pool demand stays
// bounded (~cap x 2). Tune with MAX_CONCURRENT_REQUESTS and watch
// /metrics http_peak_active_requests + http_requests_rejected_active_cap_total.
const parsedMaxRequests = Number.parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? '', 10)
const MAX_CONCURRENT_REQUESTS = Number.isFinite(parsedMaxRequests) && parsedMaxRequests > 0 ? parsedMaxRequests : 500

const parsedTelemetryInterval = Number.parseInt(process.env.TELEMETRY_LOG_INTERVAL_MS ?? '', 10)
const TELEMETRY_LOG_INTERVAL_MS = Number.isFinite(parsedTelemetryInterval) && parsedTelemetryInterval > 0 ? parsedTelemetryInterval : 60_000

let activeRequests = 0

// Throttle the per-rejection log so a sustained overload burst can't flood
// Docker's log driver while the server is already under pressure.
const REJECT_LOG_INTERVAL_MS = 5000
let lastRejectLogAt = 0
let rejectedSinceLastLog = 0

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
 * Serve admin-managed root files (e.g. ads.txt, security.txt, humans.txt) at
 * whatever route the admin configured. Content is read from a short-TTL
 * in-memory cache (see core/utils/siteFiles.ts), so this is fully synchronous
 * and never touches the database in the request path. Registered as the final
 * GET route (after controllers) so it only sees paths no controller handled;
 * if the route isn't a configured site file it falls through to the 404.
 */
function serveSiteFile (req: Request, res: Response, next: NextFunction): void {
  const route = req.path.replace(/^\/+/, '')
  const content = getSiteFileContent(route)
  if (content === null || content.length === 0) {
    next()
    return
  }
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.set('Cache-Control', 'public, max-age=300')
  res.send(content)
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
    // Static assets are cache-busted with ?cache=<buildString>, so a long
    // max-age is safe: after a redeploy the new HTML references a new URL.
    // Non-asset files (robots.txt, sitemap.xml) stay short-lived.
    this.app.use(express.static(path.join(__dirname, 'public'), {
      maxAge: '30d',
      setHeaders: (res: Response, filePath: string) => {
        if (/\.(html?|xml|txt|json)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=300')
        }
      }
    }))
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

    // Prometheus-format telemetry. Registered before the active-request cap so
    // it stays reachable while the app is under load, like /health. Process and
    // system metrics are only sensitive if someone can reach this route, so it
    // is gated behind an optional bearer token for production; leaving
    // METRICS_TOKEN unset keeps it open (e.g. local dev).
    this.app.get('/metrics', (req: Request, res: Response) => {
      const metricsToken = process.env.METRICS_TOKEN
      if (metricsToken !== undefined && metricsToken !== '' &&
          req.get('authorization') !== `Bearer ${metricsToken}`) {
        res.status(StatusCodes.FORBIDDEN).send('Forbidden')
        return
      }
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      res.set('Cache-Control', 'no-store')
      res.send(telemetry.prometheusText())
    })

    // Bound request state retained during traffic spikes or database pressure.
    // Every admitted request is timed and recorded by telemetry; rejections
    // increment a counter and are logged (throttled) so capacity limits stay
    // visible in the logs and on /metrics.
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        // Rejected requests never enter telemetry's active gauge or totals, so
        // http_peak_active_requests can't exceed the cap and http_requests_total
        // only counts work the server actually admitted.
        telemetry.requestRejectedByActiveCap()
        rejectedSinceLastLog++
        const now = Date.now()
        if (now - lastRejectLogAt >= REJECT_LOG_INTERVAL_MS) {
          lastRejectLogAt = now
          logger.log('warn', `Rejected ${rejectedSinceLastLog} request(s) at the active-request cap`, {
            active: activeRequests,
            max: MAX_CONCURRENT_REQUESTS,
            method: req.method,
            path: req.path,
            ua: req.get('user-agent')
          })
          rejectedSinceLastLog = 0
        }
        res.setHeader('Retry-After', '1')
        res.status(StatusCodes.SERVICE_UNAVAILABLE).send({ error: 'Server is busy, please try again shortly' })
        return
      }

      telemetry.requestStart()
      activeRequests++
      let released = false
      const startedAt = Date.now()
      const release = (): void => {
        if (!released) {
          released = true
          activeRequests--
          telemetry.requestEnd(Date.now() - startedAt, res.statusCode)
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
        buildAssetUrlWithReturn: buildAssetUrlWithReturn,
        buildCategoryPath: buildCategoryPath,
        buildEnginePath: buildEnginePath,
        safeJsonLd: safeJsonLd
      }

      res.locals.buildString = buildString

      next()
    })

    // Account/auth/admin pages carry personal data or exist only for signed-in
    // workflows: never cache them and never let them enter the index.
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/dashboard') || req.path.startsWith('/api/') ||
          req.path.startsWith('/admin') || req.path.startsWith('/register')) {
        res.set('Cache-Control', 'no-store')
        res.set('X-Robots-Tag', 'noindex, nofollow')
      }
      next()
    })

    // Public anonymous pages can be cached briefly for crawlers and repeat
    // visitors; authenticated responses are always revalidated. Never clobber
    // an existing Cache-Control (e.g. the no-store set above for
    // /dashboard, /api/, /admin and /register).
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && req.cookies?.['auth-token'] === undefined &&
          res.getHeader('Cache-Control') === undefined) {
        res.set('Cache-Control', 'public, max-age=120')
      }
      next()
    })

    this.setupControllers()

    // Admin-managed site files are served by a wildcard route registered after
    // the controllers so it only sees paths no controller handled. If the path
    // matches a configured site file it is served as text/plain; otherwise it
    // falls through to the 404 handler in start().
    this.app.get('*', serveSiteFile)

    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.log('error', err.message, [err])

      // Track MongoDB pool / topology health separately from HTTP errors so
      // capacity tuning is driven by numbers, not guesses.
      const errorName = (err as any)?.name ?? ''
      const errorMessage = typeof (err as any)?.message === 'string' ? (err as any).message : ''
      if (errorName === 'MongoWaitQueueTimeoutError' || /connection pool/i.test(errorMessage)) {
        telemetry.recordMongoWaitQueueTimeout()
      } else if (errorName === 'MongoServerSelectionError' || /server selection/i.test(errorMessage)) {
        telemetry.recordMongoServerSelectionError()
      }

      // Explicit status codes (e.g. BadRequestError) are honored; anything
      // else is a server error, not a client error.
      const statusCode = (err as any).statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR

      const wantsHtml = req.accepts(['html', 'json']) === 'html' && !req.path.startsWith('/api/')
      res.set('Cache-Control', 'no-store')
      res.set('X-Robots-Tag', 'noindex, nofollow')
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
    this.app.get('*', (_req: Request, res: Response) => {
      // Unmatched routes are real 404s, not redirects, so crawlers and users
      // see the correct status. The /lost page renders inside the normal shell.
      // 404 URLs must not be indexed.
      res.set('Cache-Control', 'no-store')
      res.set('X-Robots-Tag', 'noindex, nofollow')
      return res.status(StatusCodes.NOT_FOUND).render('templates/pages/lost/not-found', {
        pageBanner: {
          title: 'Page not found',
          info: 'The page you were looking for doesn\'t exist'
        }
      })
    })

    this.app.listen(port, () => {
      telemetry.startPeriodicLogging(TELEMETRY_LOG_INTERVAL_MS)
      logger.log('info', `Running on port: ${port}`)
    })
  }
}

export default RouterServer
