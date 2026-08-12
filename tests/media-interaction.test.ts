import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

// Evaluate the real browser script (not a copy) so the regression test tracks
// the shipped gallery/lightbox/theme logic.
const utilitiesSource = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'static', 'javascript', 'utilities.js'),
  'utf8'
)

const GALLERY_HTML = `
<div class="media">
  <div class="player"><div class="container" data-media-stage>
    <div class="media-layer media-image-layer" style="display: none;">
      <button type="button" class="media-image-button" data-media-index=""><img class="media-frame media-image" data-media-type="image" src="img0.png" data-media-url="img0.png"></button>
    </div>
    <div class="media-layer media-video-layer" data-media-video-layer data-media-url="https://www.youtube-nocookie.com/embed/VIDID">
      <button type="button" class="video-cover" data-media-play><img class="video-poster" src="poster.jpg" data-fallback-image="poster.jpg" alt=""><span class="video-play-icon">&#9654;</span></button>
      <iframe class="media-frame media-video" data-media-iframe src="about:blank" style="display: none;"></iframe>
    </div>
    <div class="media-counter" data-media-counter>1 / 2</div>
  </div></div>
  <div class="thumbnails" data-media-rail>
    <div class="rail-viewport" data-media-rail-viewport>
      <div class="rail-track">
        <button type="button" class="thumbnail-btn active" data-media-index="0" data-media-type="video" data-media-url="https://www.youtube-nocookie.com/embed/VIDID" data-media-image-url="video-url" aria-current="true"><img src="poster.jpg" data-fallback-image="poster.jpg" alt="A video"></button>
        <button type="button" class="thumbnail-btn" data-media-index="1" data-media-type="image" data-media-url="img1.png" data-media-image-url="img1.png" data-media-display-url="img1.png" aria-current="false"><img src="img1-thumb.png" data-fallback-image="img1.png" alt="An image"></button>
      </div>
    </div>
  </div>
</div>
<div class="modal media-lightbox" data-dialog="media">
  <div class="background"></div>
  <div class="modal-media body">
    <div class="lightbox-header"><span data-lightbox-counter></span><button type="button" class="close" data-dialog-close>×</button></div>
    <button type="button" class="previous" data-media-lightbox-previous>‹</button>
    <div class="image-container"><img src="/images/noimage.png" alt="" data-media-lightbox-image data-fallback-image="/images/noimage.png"></div>
    <button type="button" class="next" data-media-lightbox-next>›</button>
    <div class="lightbox-strip" data-lightbox-strip></div>
  </div>
</div>
`

function makeDom (html: string): JSDOM {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously'
  })
  dom.window.eval(utilitiesSource)
  dom.window.document.body.innerHTML = html
  return dom
}

function q (dom: JSDOM, selector: string): Element | null {
  return dom.window.document.querySelector(selector)
}

describe('media gallery state machine', () => {
  it('switches between video and image from a video-first gallery', () => {
    const dom = makeDom(GALLERY_HTML)
    const media = (dom.window as any).godotLibrary.media
    media.init()

    assert.equal(media.selectedIndex, 0)

    // Switch to the image (index 1)
    media.switchToMedia(1)
    assert.equal((q(dom, '.media-image-layer') as HTMLElement).style.display, 'block')
    assert.equal((q(dom, '.media-video-layer') as HTMLElement).style.display, 'none')
    assert.equal((q(dom, '[data-media-iframe]') as HTMLIFrameElement).src, 'about:blank')
    // The focusable button's index is synced so the lightbox can open.
    assert.equal(q(dom, '.media-image-button')?.getAttribute('data-media-index'), '1')

    // Switch back to the video (index 0) — iframe must NOT load yet (click-to-load)
    media.switchToMedia(0)
    assert.equal((q(dom, '.media-video-layer') as HTMLElement).style.display, 'block')
    assert.equal((q(dom, '.media-image-layer') as HTMLElement).style.display, 'none')
    assert.equal((q(dom, '[data-media-iframe]') as HTMLIFrameElement).src, 'about:blank')
    assert.equal((q(dom, '.video-cover') as HTMLElement).style.display, 'flex')
  })

  it('loads the privacy-enhanced iframe only on an explicit play gesture', () => {
    const dom = makeDom(GALLERY_HTML)
    const media = (dom.window as any).godotLibrary.media
    media.init()
    media.switchToMedia(0)

    media.playVideo()
    const iframe = q(dom, '[data-media-iframe]') as HTMLIFrameElement
    assert.ok(iframe.src.startsWith('https://www.youtube-nocookie.com/embed/VIDID'))
    assert.ok(iframe.src.includes('autoplay=1'))
    assert.equal(iframe.style.display, 'block')
    assert.equal((q(dom, '.video-cover') as HTMLElement).style.display, 'none')
  })

  it('opens an image-only lightbox and navigates image indices only', () => {
    const dom = makeDom(GALLERY_HTML)
    const media = (dom.window as any).godotLibrary.media
    media.init()
    media.switchToMedia(1)

    const button = q(dom, '.media-image-button') as HTMLButtonElement
    media.openLightbox(button)
    const lightbox = q(dom, '.modal.media-lightbox') as HTMLElement
    assert.equal(lightbox.classList.contains('active'), true)
    assert.equal((q(dom, '[data-media-lightbox-image]') as HTMLImageElement).getAttribute('src'), 'img1.png')
    assert.equal(q(dom, '[data-lightbox-counter]')?.textContent, '1 / 1')

    // Only one image exists, so navigation stays on it (and prev/next are hidden).
    media.moveLightbox(-1)
    assert.equal((q(dom, '[data-media-lightbox-image]') as HTMLImageElement).getAttribute('src'), 'img1.png')

    media.closeLightbox()
    assert.equal(lightbox.classList.contains('active'), false)
  })
})

describe('theme persistence and control', () => {
  it('defaults to system, applies it, and stores an explicit choice', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      beforeParse (window) {
        window.matchMedia = window.matchMedia ?? (() => ({ matches: false })) as any
      }
    })
    dom.window.eval(utilitiesSource)
    const theme = (dom.window as any).godotLibrary.theme
    assert.equal(theme.getStored(), 'system')

    theme.set('dark')
    assert.equal(theme.getStored(), 'dark')
    assert.equal(dom.window.document.documentElement.getAttribute('data-theme'), 'dark')

    theme.set('system')
    assert.equal(theme.getStored(), 'system')
  })

  it('rejects invalid theme values', () => {
    const dom = makeDom('<div></div>')
    const theme = (dom.window as any).godotLibrary.theme
    theme.set('blue')
    assert.equal(theme.getStored(), 'system')
  })
})
