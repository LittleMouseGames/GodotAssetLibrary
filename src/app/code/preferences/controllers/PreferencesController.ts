import { Controller, Post } from '@overnightjs/core'
import { Request, Response } from 'express'
import {
  GODOT_VERSION_PREFERENCE_COOKIE,
  isGodotVersionPreference
} from 'core/utils/godotVersionPreference'

/**
 * Validates an arbitrary redirect target so the preferences POST can never
 * become an open redirect. Only same-site relative paths are accepted.
 */
function safeLocalRedirect (raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  const value = raw.trim()
  if (value === '' || value === '//' || value.startsWith('//')) return '/'
  if (!value.startsWith('/')) return '/'
  // Reject anything that could smuggle a scheme or authority after the slash.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return '/'
  return value
}

/**
 * Server-owned, header-driven browsing preferences.
 *
 * Only the persistent Godot-version (major-line) preference is implemented
 * today. The value is stored in an HttpOnly, SameSite=Lax cookie so it never
 * varies public SSR output by itself; the server reads it to filter public
 * discovery and to decide cache visibility (see RouterServer). Every explicit
 * choice is stored — including the default 4.x — so the server can tell an
 * explicit selection apart from a first-time visitor who never touched the
 * dropdown (no cookie). Default responses stay publicly cacheable; an explicit
 * 4.x cookie is honored strictly and marked private.
 */
@Controller('preferences')
export class PreferencesController {
  @Post('godot-version')
  private async setGodotVersion (req: Request, res: Response): Promise<void> {
    const value = req.body?.version ?? ''
    const returnTo = safeLocalRedirect(req.body?.returnTo)

    if (!isGodotVersionPreference(value)) {
      res.redirect(303, returnTo)
      return
    }

    res.cookie(GODOT_VERSION_PREFERENCE_COOKIE, value, {
      httpOnly: true,
      secure: process.env.RUN_MODE === 'prod',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 365 // one year
    })

    res.redirect(303, returnTo)
  }
}
