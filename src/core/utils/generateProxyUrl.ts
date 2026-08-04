import createHmac from 'create-hmac'

const KEY = process.env.IMGPROXY_KEY ?? ''
const SALT = process.env.IMGPROXY_SALT ?? ''
const HOST = process.env.IMGPROXY_HOST ?? ''
// A partially configured proxy generates signed URLs that always fail (usually
// as HTTP 403). In that case, load the original image rather than forcing the
// browser through a broken proxy first.
const ENABLED = process.env.IMGPROXY_ENABLED === 'true' && KEY !== '' && SALT !== '' && HOST !== ''

const urlSafeBase64 = (string: Buffer | string): string => {
  return Buffer.from(string).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const hexDecode = (hex: string): Buffer => Buffer.from(hex, 'hex')

const sign = (salt: string, target: string, secret: string): string => {
  const hmac = createHmac('sha256', hexDecode(secret))
  hmac.update(hexDecode(salt))
  hmac.update(target)
  return urlSafeBase64(hmac.digest())
}

export const generateProxyUrl = (url: any, width = 640, height = 360, resizingType = 'fit', gravity = 'no', enlarge = 0, extension = 'webp'): string => {
  if (!ENABLED) {
    return url
  }

  if (url === undefined) {
    return ''
  }

  if (typeof url !== 'string' || url.includes('.mp4')) {
    return url
  }

  const encodedUrl = urlSafeBase64(url)
  const path = `/rs:${resizingType}:${width}:${height}:${enlarge}/g:${gravity}/${encodedUrl}.${extension}`
  const signature = sign(SALT, path, KEY)
  const result = `/${signature}${path}`
  return HOST + result
}
