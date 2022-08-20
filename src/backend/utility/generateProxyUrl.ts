import createHmac from 'create-hmac'

const KEY = process.env.IMGPROXY_KEY ?? ''
const SALT = process.env.IMGPROXY_SALT ?? ''

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

export const generateProxyUrl = (_url: any, resizingType = 'fit', width = 640, height = 360, gravity = 'no', enlarge = 1, extension = 'png'): string => {
  const urlTest = 'http://img.example.com/pretty/image.jpg'
  const encodedUrl = urlSafeBase64(urlTest)
  const path = `/rs:${resizingType}:${width}:${height}:${enlarge}/g:${gravity}/${encodedUrl}.${extension}`

  const signature = sign(SALT, path, KEY)
  const result = `/${signature}${path}`
  return result
}
