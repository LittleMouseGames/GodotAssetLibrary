import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

// Evaluate the real browser script (not a copy) so the regression test tracks
// the shipped fallback logic. Path resolves from dist-test/tests -> repo root.
const utilitiesSource = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'static', 'javascript', 'utilities.js'),
  'utf8'
)

function makeDom (): JSDOM {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously'
  })
  dom.window.eval(utilitiesSource)
  return dom
}

function makeImage (dom: JSDOM, attrs: Record<string, string>): HTMLImageElement {
  const img = dom.window.document.createElement('img')
  for (const [name, value] of Object.entries(attrs)) {
    img.setAttribute(name, value)
  }
  // Must be connected so the document-level capture listener sees the event.
  dom.window.document.body.appendChild(img)
  return img
}

function fireError (dom: JSDOM, img: HTMLImageElement): void {
  img.dispatchEvent(new dom.window.Event('error'))
}

function resolved (value: string | null): string {
  return new URL(value ?? '', 'http://localhost/').href
}

describe('image fallback retry guard', () => {
  it('bounded fallback for a responsive card image (proxy → original → noimage, then terminal)', () => {
    const dom = makeDom()
    const original = 'https://raw.githubusercontent.com/owner/repo/main/car.png'
    const img = makeImage(dom, {
      src: 'https://img.godotassetlibrary.com/proxy-low',
      srcset: 'https://img.godotassetlibrary.com/proxy-800 800w',
      'data-srcset': 'https://img.godotassetlibrary.com/proxy-800 800w',
      sizes: 'auto',
      'data-sizes': 'auto',
      'data-src': 'https://img.godotassetlibrary.com/proxy-800',
      'data-fallback-image': original,
      class: 'lazyload'
    })

    fireError(dom, img)

    assert.equal(img.dataset.triedFallback, 'true')
    assert.equal(resolved(img.getAttribute('src')), resolved(original))
    // The responsive/lazy pipeline is disabled so a failed candidate cannot
    // keep winning over the fallback src.
    assert.equal(img.hasAttribute('srcset'), false)
    assert.equal(img.hasAttribute('data-srcset'), false)
    assert.equal(img.hasAttribute('sizes'), false)
    assert.equal(img.hasAttribute('data-sizes'), false)
    assert.equal(img.hasAttribute('data-src'), false)
    assert.equal(img.classList.contains('lazyload'), false)

    fireError(dom, img)

    assert.equal(img.dataset.triedFallback, 'complete')
    assert.equal(resolved(img.getAttribute('src')), 'http://localhost/images/noimage.png')

    // Terminal: later errors must not mutate the image or trigger more work.
    const srcAfterTerminal = img.getAttribute('src')
    fireError(dom, img)
    fireError(dom, img)
    assert.equal(img.getAttribute('src'), srcAfterTerminal)
    assert.equal(img.dataset.triedFallback, 'complete')
  })

  it('jumps straight to the local placeholder when there is no fallback', () => {
    const dom = makeDom()
    const img = makeImage(dom, { src: 'https://img.godotassetlibrary.com/broken' })

    fireError(dom, img)

    assert.equal(img.dataset.triedFallback, 'complete')
    assert.equal(resolved(img.getAttribute('src')), 'http://localhost/images/noimage.png')

    const srcAfterTerminal = img.getAttribute('src')
    fireError(dom, img)
    assert.equal(img.getAttribute('src'), srcAfterTerminal)
  })

  it('never retries a fallback that equals the failed source', () => {
    const dom = makeDom()
    const noimage = '/images/noimage.png'
    const img = makeImage(dom, {
      src: noimage,
      'data-fallback-image': noimage
    })

    fireError(dom, img)

    assert.equal(img.dataset.triedFallback, 'complete')
    assert.equal(resolved(img.getAttribute('src')), 'http://localhost/images/noimage.png')
    fireError(dom, img)
    assert.equal(img.dataset.triedFallback, 'complete')
  })

  it('corrects relative README images against the repo host once, then terminates', () => {
    const dom = makeDom()
    const host = 'https://raw.githubusercontent.com/detomon/wigglebone/master/'
    const img = makeImage(dom, {
      src: 'images/editor.gif',
      'data-host': host,
      'data-fallback-image': '/images/noimage.png'
    })

    fireError(dom, img)

    assert.equal(img.dataset.triedFallback, 'true')
    assert.equal(resolved(img.getAttribute('src')), resolved(`${host}images/editor.gif`))

    fireError(dom, img)

    assert.equal(img.dataset.triedFallback, 'complete')
    assert.equal(resolved(img.getAttribute('src')), 'http://localhost/images/noimage.png')

    fireError(dom, img)
    assert.equal(img.dataset.triedFallback, 'complete')
  })

  it('reset allows a fresh bounded chain when a new media source is assigned', () => {
    const dom = makeDom()
    const img = makeImage(dom, {
      src: 'https://img.godotassetlibrary.com/first',
      'data-fallback-image': 'https://raw.githubusercontent.com/owner/repo/main/second.png'
    })

    fireError(dom, img)
    assert.equal(img.dataset.triedFallback, 'true')

    // media.switchToMedia / showLightboxImage reset the state for a new source.
    const third = 'https://raw.githubusercontent.com/owner/repo/main/third.png'
    img.dataset.triedFallback = 'false'
    img.setAttribute('src', 'https://img.godotassetlibrary.com/second-proxy')
    img.dataset.fallbackImage = third

    fireError(dom, img)

    assert.equal(img.dataset.triedFallback, 'true')
    assert.equal(resolved(img.getAttribute('src')), resolved(third))
  })

  it('ignores non-image error events', () => {
    const dom = makeDom()
    const div = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(div)
    assert.doesNotThrow(() => {
      div.dispatchEvent(new dom.window.Event('error'))
    })
  })
})
