import * as controllers from 'modules/controllers.index'
import { Server } from '@overnightjs/core'
import { Request, Response } from 'express'
import { logger } from 'utility/logger'
/**
 * Starts the server
 */
class RouterServer extends Server {
  private readonly FRONT_END_MSG = 'Unable to find API route'

  /**
   * Sets up our dependencies
   */
  constructor () {
    super(true)
    this.app.use(function (_req, res, next) {
      res.setHeader('X-Powered-By', '☕')
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
