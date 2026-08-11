import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { attachCardExtras } from '../src/core/utils/cardView'

describe('attachCardExtras', () => {
  it('keeps safe http(s) download URLs', () => {
    const assets: Array<Record<string, any>> = [
      { asset_id: '1', download_url: 'https://github.com/example/a.zip' }
    ]

    attachCardExtras(assets)

    assert.equal(assets[0].download_url, 'https://github.com/example/a.zip')
  })

  it('blanks non-http(s) download URLs', () => {
    const cases: Array<[string, string]> = [
      ['javascript:alert(1)', ''],
      ['ftp://example.com/a.zip', ''],
      ['data:text/plain;base64,x', ''],
      ['', ''],
      ['not a url', '']
    ]

    const assets: Array<Record<string, any>> = cases.map(([url]) => ({ asset_id: String(Math.random()), download_url: url }))
    attachCardExtras(assets)

    assets.forEach((asset, index) => {
      assert.equal(asset.download_url, cases[index][1], `expected download_url to be blank for ${cases[index][0]}`)
    })
  })

  it('is a no-op for an empty list', () => {
    attachCardExtras([])
  })
})
