import { MongoHelper } from 'core/MongoHelper'
import { buildUserContextCacheKey, cacheGetOrLoad } from 'core/utils/dragonfly'

interface UserContext {
  loggedIn: boolean
  role?: string
}

const parsedUserCtxTtl = Number.parseInt(process.env.CACHE_USER_CTX_TTL_SECONDS ?? '', 10)
const USER_CONTEXT_CACHE_TTL_SECONDS = Number.isFinite(parsedUserCtxTtl) && parsedUserCtxTtl > 0
  ? parsedUserCtxTtl
  : 30

/**
 * Load login state and role with one indexed query while rejecting expired
 * tokens. Runs only on a shared-cache miss; the result is cached for a short
 * TTL so the per-request global auth lookup stops hitting MongoDB on every
 * authenticated page view.
 */
async function loadUserContext (hashedToken: string): Promise<UserContext> {
  const mongo = MongoHelper.getDatabase()
  const user = await mongo.collection('users').findOne({
    resume_tokens: {
      $elemMatch: {
        token: hashedToken,
        expires: { $gt: new Date() }
      }
    }
  }, {
    projection: { role: 1 }
  })

  return user === null
    ? { loggedIn: false }
    : { loggedIn: true, role: user.role as string | undefined }
}

/**
 * Fetch login state and role, cached in Dragonfly (short TTL, fail-open).
 * The key is invalidated on logout and account deletion; a stale entry can
 * only outlive a revocation by at most the TTL.
 */
export async function GetUserContextByToken (hashedToken: string): Promise<UserContext> {
  const cached = await cacheGetOrLoad<UserContext>(
    buildUserContextCacheKey(hashedToken),
    USER_CONTEXT_CACHE_TTL_SECONDS,
    async () => await loadUserContext(hashedToken)
  )
  return cached.value
}
