import * as controllers from 'core/controllers.index'
import { Server } from '@overnightjs/core'
import express, { NextFunction, Request, Response } from 'express'
import { Server as HttpServer } from 'http'
import { logger } from 'core/utils/logger'
import compression from 'compression'
import path from 'path'
import cookieParser from 'cookie-parser'
import { TokenServices } from 'core/modules/authentication/services/TokenServices'
import { GetUserContextByToken } from 'core/modules/authentication/models/user/GET/GetUserContextByToken'
import { GetPromobarMessage } from 'app/code/admin/models/GET/GetPromobarMesasge'
import { StatusCodes } from 'http-status-codes'
import { getSiteFileContent } from 'core/utils/siteFiles'
import { classifyCacheControl } from 'core/utils/httpCachePolicy'
import { getReleaseId } from 'core/utils/releaseId'
import { generateProxyUrl } from 'core/utils/generateProxyUrl'
import { buildAssetUrl, buildAssetUrlWithReturn } from 'core/utils/assetUrl'
import { buildCategoryPath, buildEnginePath } from 'core/utils/taxonomyUrl'
import { safeJsonLd } from 'core/utils/jsonLd'
import {
  GODOT_VERSION_PREFERENCE_COOKIE,
  GODOT_VERSION_PREFERENCES,
  godotVersionPreferenceLabel,
  normalizeGodotVersionPreference
} from 'core/utils/godotVersionPreference'
import * as telemetry from 'core/utils/telemetry'
import { classifyRouteClass } from 'core/utils/routeClass'
require('express-async-errors')

let promoCachedMessage: string | null = null
let promoCacheExpiresAt = 0
let promoRefresh: Promise<void> | null = null
const PROMO_TTL_MS = 60_000

const parsedTelemetryInterval = Number.parseInt(process.env.TELEMETRY_LOG_INTERVAL_MS ?? '', 10)
const TELEMETRY_LOG_INTERVAL_MS = Number.isFinite(parsedTelemetryInterval) && parsedTelemetryInterval > 0 ? parsedTelemetryInterval : 60_000

/** Read a positive integer from an env var, falling back when unset/invalid. */
function parsePositiveIntEnv (name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

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
 * whatever route the admin configured. Content is read through a short-TTL
 * in-memory cache (see core/utils/siteFiles.ts) that awaits a refresh when
 * stale, so the first request after a change serves fresh data instead of a
 * stale value or a bogus 404. Registered as the final GET route (after
 * controllers) so it only sees paths no controller handled; if the route
 * isn't a configured site file it falls through to the 404.
 */
async function serveSiteFile (req: Request, res: Response, next: NextFunction): Promise<void> {
  const route = req.path.replace(/^\/+/, '')
  const content = await getSiteFileContent(route)
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

    // Deployment-wide release id shared by every worker and refork, so static
    // cache busters (?cache=<id>) converge instead of differing per worker.
    const buildString = getReleaseId()

    this.app.disable('x-powered-by')
    this.app.set('view engine', 'eta')
    this.app.set('views', path.join(__dirname, '/'))
    this.app.set('trust proxy', 1)
    this.app.use(compression())
    // Static assets are cache-busted with ?cache=<buildString> (a stable,
    // deployment-wide id), so a one-year immutable policy is safe: after a
    // redeploy the new HTML references a new URL and old entries are simply
    // never requested again. Mutable text files (robots.txt, sitemap.xml) stay
    // short-lived.
    this.app.use(express.static(path.join(__dirname, 'public'), {
      setHeaders: (res: Response, filePath: string) => {
        // Count every static file actually served so /metrics can separate
        // static (disk/cache) traffic from dynamic SSR traffic.
        telemetry.recordStaticRequest()
        if (/\.(html?|xml|txt|json)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=300')
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
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

    // Prometheus-format telemetry. Registered early so it stays reachable
    // while the app is under load, like /health. Process and system metrics
    // are only sensitive if someone can reach this route, so it
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

    // Track every dynamic request for telemetry (active/peak gauges plus
    // duration/status/route-class stats) without rejecting anything. There is
    // deliberately no in-flight request cap: cached reads are cheap, and
    // uncached work either completes or trips MongoDB's fail-fast timeouts and
    // surfaces as a real error instead of a synthetic 503. Watch
    // http_active_requests and http_request_duration_p99_ms on /metrics during
    // bursts.
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const routeClass = classifyRouteClass(req.method, req.path, req.query)
      telemetry.requestStart(routeClass)
      let released = false
      const startedAt = Date.now()
      const release = (): void => {
        if (!released) {
          released = true
          telemetry.requestEnd(Date.now() - startedAt, res.statusCode, routeClass)
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

      // Persistent Godot-version (major-line) browsing preference, surfaced to
      // every Eta view (the header selector renders from it). The preference is
      // a functional, non-authenticated cookie; see the preferences controller.
      const versionPreference = normalizeGodotVersionPreference(req.cookies[GODOT_VERSION_PREFERENCE_COOKIE])
      res.locals.godotVersion = {
        current: versionPreference,
        label: godotVersionPreferenceLabel(versionPreference),
        options: GODOT_VERSION_PREFERENCES,
        returnTo: req.originalUrl
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

    // Centralized cache policy (see core/utils/httpCachePolicy.ts). Anonymous
    // canonical public views get an aggressive shared policy (5-minute s-maxage
    // + stale-while-revalidate + 24h stale-if-error) so Cloudflare/edge caches
    // absorb nearly all repeat traffic; authenticated, version-cookie,
    // arbitrary-query and high-cardinality responses are never shared-cacheable.
    // Never clobber a Cache-Control set by an earlier middleware (e.g. the
    // no-store for /dashboard, /api/, /admin and /register above). Handlers that
    // produce an error/404 override this with no-store themselves.
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (res.getHeader('Cache-Control') === undefined) {
        const decision = classifyCacheControl(req)
        if (decision !== null) {
          res.set('Cache-Control', decision)
        }
      }
      next()
    })

    this.setupControllers()

    // Admin-managed site files are served by a wildcard route registered after
    // the controllers so it only sees paths no controller handled. If the path
    // matches a configured site file it is served as text/plain; otherwise it
    // falls through to the 404 handler in start().
    this.app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // The handler is async so it can await a fresh cache refresh; this sync
      // wrapper keeps the registration void-returning (lint-clean) and routes
      // any rejection to the error middleware.
      void serveSiteFile(req, res, next).catch(next)
    })

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
   * @returns the underlying http.Server so the caller can drain it on shutdown
   */
  public start (port: number): HttpServer {
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

    const server = this.app.listen(port, () => {
      telemetry.startPeriodicLogging(TELEMETRY_LOG_INTERVAL_MS)
      telemetry.startEventLoopLagMonitor()
      logger.log('info', `Running on port: ${port}`)
    })

    // Count open keep-alive sockets so overload shows up as socket pressure
    // before requests queue.
    telemetry.trackServerSockets(server)

    // Explicit, environment-tunable socket/session timeouts so slow or broken
    // clients (or a traffic flood) can't pin worker sockets forever. The
    // defaults reflect the Cloudflare->origin pattern: long-lived keep-alive
    // connections, bounded requests per socket, and a hard request deadline.
    // requestTimeout/headersTimeout/maxRequestsPerSocket are newer Node
    // properties not present in this project's @types/node, hence the cast.
    const tune = server as HttpServer & {
      requestTimeout?: number
      headersTimeout?: number
      maxRequestsPerSocket?: number
    }
    tune.requestTimeout = parsePositiveIntEnv('HTTP_REQUEST_TIMEOUT_MS', 60_000)
    tune.headersTimeout = parsePositiveIntEnv('HTTP_HEADERS_TIMEOUT_MS', 60_000)
    tune.maxRequestsPerSocket = parsePositiveIntEnv('HTTP_MAX_REQUESTS_PER_SOCKET', 1000)
    server.keepAliveTimeout = parsePositiveIntEnv('HTTP_KEEPALIVE_TIMEOUT_MS', 5_000)

    server.on('error', (error: NodeJS.ErrnoException) => {
      logger.log('error', `HTTP server error: ${error.message}`, [error])
      // A fatal listen failure (e.g. port already taken after a race) is
      // unrecoverable: exit so the cluster primary auto-refork is triggered.
      if (!server.listening && (error.code === 'EADDRINUSE' || error.code === 'EACCES')) {
        logger.log('error', `Fatal listen error (${error.code}); exiting for cluster refork`)
        process.exit(1)
      }
    })

    return server
  }
}

export default RouterServer
