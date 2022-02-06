import * as controllers from 'modules/controllers.index'
import { Server } from '@overnightjs/core'
import express, { Request, Response } from 'express'
import { logger } from 'utility/logger'
import compression from 'compression'
import path from 'path'

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
    this.app.set('views', path.join(__dirname, 'backend/'))
    this.app.set('trust proxy', 1)
    this.app.use(compression())
    this.app.use(express.static(path.join(__dirname, 'public')))
    this.app.use(express.json())
    this.app.use(express.urlencoded())

    this.app.use(function (_req, res, next) {
      res.setHeader('X-Powered-By', 'LittleMouseGames')
      next()
    })

    this.setupControllers()
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
      res.send(this.FRONT_END_MSG)
    })

    this.app.listen(port, () => {
      logger.log('info', `Running on port: ${port}`)
    })
  }
}

export default RouterServer
