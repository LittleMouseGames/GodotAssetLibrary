import * as https from 'https'

export const nodeFetch = async function nodeFetch (requestOptions: https.RequestOptions): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const request = https.request(requestOptions, (response) => {
      if (response.statusCode !== undefined) {
        if (response.statusCode < 200 || response.statusCode > 299) {
          reject(new Error(`Non-2xx status code: ${response.statusCode}`))
        }

        const body = new Array<Buffer | string>()

        response.on('data', (chunk) => body.push(chunk))
        response.on('end', () => resolve(body.join('')))
      } else {
        reject(new Error('Status code undefined'))
      }
    })

    request.on('error', (err) => reject(err))
    request.end()
  })
}
