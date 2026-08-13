import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

// Evaluate the real browser script so the test tracks the shipped dropdown
// AJAX helper (callRouteAjax), including its HTTP method handling.
const utilitiesSource = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'static', 'javascript', 'utilities.js'),
  'utf8'
)

function makeDom (html: string): JSDOM {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    url: 'http://localhost/',
    runScripts: 'dangerously'
  })
  dom.window.eval(utilitiesSource)
  return dom
}

describe('dropdown.callRouteAjax', () => {
  it('defaults to GET so existing report actions keep working', async () => {
    const dom = makeDom('<div class="page-message"><div class="messages"></div></div>')
    try {
      const calls: Array<{ url: string, method: string }> = []
      ;(dom.window as any).fetch = async (url: string, opts: { method?: string }) => {
        calls.push({ url, method: String(opts?.method ?? 'get').toUpperCase() })
        return { ok: true, json: async () => ({}) }
      }

      const event = new dom.window.Event('click', { cancelable: true, bubbles: true })
      ;(dom.window as any).godotLibrary.dropdown.callRouteAjax(event, '/admin/report/ignore/x', 'ok')
      await new Promise(resolve => setTimeout(resolve, 10))

      assert.equal(calls.length, 1)
      assert.equal(calls[0].url, '/admin/report/ignore/x')
      assert.equal(calls[0].method, 'GET')
    } finally {
      dom.window.close()
    }
  })

  it('honors an explicit POST for the feature toggle route', async () => {
    const dom = makeDom('<div class="page-message"><div class="messages"></div></div>')
    try {
      const calls: Array<{ url: string, method: string }> = []
      ;(dom.window as any).fetch = async (url: string, opts: { method?: string }) => {
        calls.push({ url, method: String(opts?.method ?? 'get').toUpperCase() })
        return { ok: true, json: async () => ({}) }
      }

      const event = new dom.window.Event('click', { cancelable: true, bubbles: true })
      ;(dom.window as any).godotLibrary.dropdown.callRouteAjax(event, '/admin/feature-post/x', 'ok', undefined, 'post')
      await new Promise(resolve => setTimeout(resolve, 10))

      assert.equal(calls.length, 1)
      assert.equal(calls[0].url, '/admin/feature-post/x')
      assert.equal(calls[0].method, 'POST')
    } finally {
      dom.window.close()
    }
  })
})
