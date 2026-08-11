import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { getAllGuides, getGuideBySlug } from '../models/guide'

function xmlEscape (value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export class GuidesService {
  public renderIndex (_req: Request, res: Response): void {
    const guides = getAllGuides()
    return res.render('templates/pages/guides/index', { guides })
  }

  public renderGuide (req: Request, res: Response): void {
    const guide = getGuideBySlug(req.params.slug ?? '')
    if (guide === undefined) {
      return res.status(StatusCodes.NOT_FOUND).render('templates/pages/lost/not-found', {
        pageBanner: {
          title: 'Guide not found',
          info: 'We couldn\'t find that guide'
        }
      })
    }
    const relatedGuides = getAllGuides().filter(other => other.slug !== guide.slug).slice(0, 3)
    return res.render('templates/pages/guides/view', { guide, relatedGuides })
  }

  public renderFeed (_req: Request, res: Response): void {
    const guides = getAllGuides()
    const items = guides.map(guide => {
      const description = xmlEscape(guide.description)
      const pubDate = guide.date !== '' ? new Date(guide.date).toUTCString() : new Date().toUTCString()
      return [
        '    <item>',
        `      <title>${xmlEscape(guide.title)}</title>`,
        `      <link>https://godotassetlibrary.com${guide.url}</link>`,
        `      <guid isPermaLink="true">https://godotassetlibrary.com${guide.url}</guid>`,
        `      <description>${description}</description>`,
        `      <pubDate>${pubDate}</pubDate>`,
        '    </item>'
      ].join('\n')
    }).join('\n')

    const feed = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      '  <channel>',
      '    <title>Godot Asset Library Guides</title>',
      '    <link>https://godotassetlibrary.com/guides</link>',
      '    <description>Guides and tutorials for using Godot assets from the Godot Asset Library.</description>',
      '    <language>en</language>',
      items,
      '  </channel>',
      '</rss>'
    ].join('\n')

    res.set('Content-Type', 'application/rss+xml; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=600')
    res.send(feed)
  }
}
