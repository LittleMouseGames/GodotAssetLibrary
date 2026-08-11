import { Controller, Get, Middleware, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import rateLimit from 'express-rate-limit'
import { rateLimitHandler } from 'core/utils/rateLimitHandler'
import { buildCategoryPath, buildEnginePath, normalizeTaxonomyKey } from 'core/utils/taxonomyUrl'
import { SearchService } from '../services/SearchService'

/**
 * Consolidate every spelling of a taxonomy URL onto its canonical path.
 * `/category/2d+tools`, `/category/2D+TOOLS` and `/category/2d%20tools` all
 * resolve to the same category server-side, but they are distinct URLs to a
 * crawler. A 301 (preserving any query) funnels the link equity into one URL.
 */
function canonicalTaxonomyRedirect (req: Request, res: Response, canonicalPath: string): boolean {
  const pathPart = (req.originalUrl.split('?')[0] ?? '').replace(/\/+$/, '')
  const requestPath = pathPart !== '' ? pathPart : '/'
  if (requestPath === canonicalPath) return false
  const queryIndex = req.originalUrl.indexOf('?')
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : ''
  res.redirect(StatusCodes.MOVED_PERMANENTLY, `${canonicalPath}${query}`)
  return true
}

const searchRedirectRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 50, // start blocking after x requests
  handler: rateLimitHandler('You\'re doing that too much, please try again later')
})

const searchRateLimit = rateLimit({
  windowMs: 1000 * 60 * 15, // 15 minutes
  max: 50, // start blocking after x requests
  handler: rateLimitHandler('You\'re doing that too much, please try again later')
})

@Controller('search')
export class SearchController {
  private readonly SearchService: SearchService = new SearchService()

  @Get('/')
  @Middleware(searchRateLimit)
  private async index (req: Request, res: Response): Promise<void> {
    return await this.SearchService.render(req, res)
  }

  @Post('/')
  @Middleware(searchRedirectRateLimit)
  private async getQuery (req: Request, res: Response): Promise<void> {
    return this.SearchService.redirectToSearchUrl(req, res)
  }
}

@Controller('category')
export class CategoryController {
  private readonly SearchService: SearchService = new SearchService()

  @Get(':category')
  @Middleware(searchRateLimit)
  private async index (req: Request, res: Response): Promise<void> {
    const canonical = buildCategoryPath(normalizeTaxonomyKey(req.params.category ?? ''))
    if (canonical === '') {
      return res.redirect(StatusCodes.MOVED_PERMANENTLY, '/search/')
    }
    if (canonicalTaxonomyRedirect(req, res, canonical)) return
    return await this.SearchService.render(req, res)
  }
}

@Controller('engine')
export class EngineController {
  private readonly SearchService: SearchService = new SearchService()

  @Get(':engine')
  @Middleware(searchRateLimit)
  private async index (req: Request, res: Response): Promise<void> {
    const canonical = buildEnginePath(normalizeTaxonomyKey(req.params.engine ?? ''))
    if (canonical === '') {
      return res.redirect(StatusCodes.MOVED_PERMANENTLY, '/search/')
    }
    if (canonicalTaxonomyRedirect(req, res, canonical)) return
    return await this.SearchService.render(req, res)
  }
}
