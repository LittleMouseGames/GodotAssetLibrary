import { Request, Response, NextFunction } from 'express'
import { GetUserByToken } from 'modules/api/authentication/models/user/GET/get.user.by.token'
import { logger } from 'utility/logger'
import { TokenServices } from 'modules/api/authentication/services/TokenServices'

module.exports = (req: Request, res: Response, next: NextFunction) => {
  try {
    const TokenService = TokenServices.getInstance()
    const authHeader = req.headers.authorization ?? ''

    if (authHeader === '') {
      throw new Error('Missing auth header')
    }

    if (authHeader.includes('Bearer')) {
      let token = authHeader.split(' ')[1] ?? ''

      if (token === '') {
        throw new Error('Missing auth token')
      }

      token = TokenService.hashToken(token)

      GetUserByToken(token).then(() => {
        next()
      }).catch(e => {
        logger.log('error', e.mesage, ...[e])
        throw new Error('User not found')
      })
    } else {
      throw new Error('Invalid auth')
    }
  } catch (e: any) {
    res.status(401).json({
      error: new Error(e.message)
    })
  }
}
