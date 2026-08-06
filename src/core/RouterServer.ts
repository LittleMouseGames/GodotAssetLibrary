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
        generateProxyUrl: generateProxyUrl
      }

      res.locals.buildString = buildString

      next()
    })

    this.setupControllers()

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.log('error', err.message, [err])
      return res.status(StatusCodes.BAD_REQUEST).send({ error: err.message })
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
      res.redirect('/lost')
      // res.send(this.FRONT_END_MSG)
    })

    this.app.listen(port, () => {
      logger.log('info', `Running on port: ${port}`)
    })
  }
}

export default RouterServer
