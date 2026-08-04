import * as https from 'https'

interface NodeFetchOptions extends https.RequestOptions {
  maxResponseSize?: number
  timeoutMs?: number
}

const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000

export const nodeFetch = async function nodeFetch (options: NodeFetchOptions): Promise<string> {
  const { maxResponseSize = DEFAULT_MAX_RESPONSE_SIZE, timeoutMs = DEFAULT_TIMEOUT_MS, ...requestOptions } = options

  return await new Promise<string>((resolve, reject) => {
    let settled = false
    const settle = (callback: () => void): void => {
      if (!settled) {
        settled = true
        callback()
      }
    }

    const request = https.request(requestOptions, (response) => {
      if (response.statusCode === undefined) {
        response.destroy()
        settle(() => reject(new Error('Status code undefined')))
        return
      }

      if (response.statusCode < 200 || response.statusCode > 299) {
        response.resume()
        settle(() => reject(new Error(`Non-2xx status code: ${response.statusCode}`)))
        return
      }

      let responseSize = 0
      const body: Buffer[] = []

      response.on('data', (chunk: Buffer) => {
        responseSize += chunk.length
        if (responseSize > maxResponseSize) {
          response.destroy()
          settle(() => reject(new Error(`Response exceeds ${maxResponseSize} byte limit`)))
          return
        }

        body.push(chunk)
      })
      response.on('end', () => settle(() => resolve(Buffer.concat(body).toString('utf8'))))
      response.on('error', (error) => settle(() => reject(error)))
    })

    request.on('error', (error) => settle(() => reject(error)))
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Request timed out after ${timeoutMs}ms`)))
    request.end()
  })
}
