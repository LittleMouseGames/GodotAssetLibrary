import * as controllers from 'modules/controllers.index'
import { Server } from '@overnightjs/core'
import express, { NextFunction, Request, Response } from 'express'
import { logger } from 'utility/logger'
import compression from 'compression'
import path from 'path'
import cookieParser from 'cookie-parser'
import { TokenServices } from 'modules/common/authentication/services/TokenServices'
import { GetDoesUserExistByToken } from 'modules/common/authentication/models/user/GET/GetDoesUserExistByToken'
import { GetUserRoleByToken } from 'modules/common/authentication/models/user/GET/GetUserRoleByToken'
import { GetPromobarMessage } from 'modules/pages/admin/models/GET/GetPromobarMesasge'
import { StatusCodes } from 'http-status-codes'
require('express-async-errors')

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
          res.locals.loggedIn = await GetDoesUserExistByToken(hashedToken)
          res.locals.role = await GetUserRoleByToken(hashedToken)
        } catch (e) {
          // ignore
        }
      }

      try {
        res.locals.promobarMessage = await GetPromobarMessage()
      } catch (e) {
        // ignore
      }

      next()
    })

    this.app.use(function (_req, res, next) {
      res.setHeader('X-Powered-By', 'Godot Asset Library, an AGPLv3 Software')
      next()
    })

    this.setupControllers()

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.log('error', err.message, ...[err])
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
