import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

// Evaluate the REAL browser script so the regression test tracks the shipped
// hero carousel behavior (arrows, dots, keyboard, swipe, autoplay pauses).
const utilitiesSource = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'static', 'javascript', 'utilities.js'),
  'utf8'
)

interface HeroDom {
  dom: JSDOM
  ticks: Array<() => void>
  mq: { matches: boolean, listeners: Array<() => void> } | null
}

function heroHtml (count: number): string {
  if (count === 0) {
    return '<section class="home-hero"><div class="hero-fallback"><h2>Discover</h2><p>Text</p><a class="hero-cta" href="/search/">Browse assets</a></div></section>'
  }
  const slides = Array.from({ length: count }, (_, i) => `
    <div class="hero-slide${i === 0 ? ' active' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${count}" data-hero-slide="${i}"${i === 0 ? '' : ' hidden'}>
      <div class="hero-art"><img src="img${i}.png" data-fallback-image="img${i}.png" alt="" width="960" height="540"></div>
      <div class="hero-info">
        <span class="hero-eyebrow">Featured</span>
        <h2 class="hero-title"><a href="/asset/id${i}">Title ${i}</a></h2>
      </div>
    </div>`).join('\n')
  const dots = count > 1
    ? Array.from({ length: count }, (_, i) =>
      `<button type="button" class="hero-dot${i === 0 ? ' active' : ''}" data-hero-dot="${i}" aria-label="Go to slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ''}></button>`).join('\n')
    : ''
  const controls = count > 1
    ? `
      <div class="hero-controls">
        <button type="button" class="hero-arrow hero-prev" data-hero-prev aria-label="Previous featured asset"><span aria-hidden="true">&#8249;</span></button>
        <div class="hero-dots" data-hero-dots>
          ${dots}
        </div>
        <button type="button" class="hero-arrow hero-next" data-hero-next aria-label="Next featured asset"><span aria-hidden="true">&#8250;</span></button>
        <button type="button" class="hero-play" data-hero-play aria-pressed="true" aria-label="Pause automatic rotation"><span class="iconify" data-icon="akar-icons:pause" aria-hidden="true"></span></button>
      </div>
      <div class="hero-status" data-hero-status aria-live="polite" role="status"></div>`
    : ''
  return `<section class="home-hero" role="region" aria-roledescription="carousel" aria-label="Featured Godot assets" data-hero-carousel data-hero-autoplay="7000">
    <h1 class="visually-hidden">Featured Godot assets</h1>
    <div class="hero-viewport" data-hero-viewport>
      ${slides}
    </div>
    ${controls}
  </section>`
}

function makeHeroDom (html: string, opts: { reducedMotion?: boolean } = {}): HeroDom {
  const ticks: Array<() => void> = []
  const mq: { matches: boolean, listeners: Array<() => void> } = {
    matches: opts.reducedMotion ?? false,
    listeners: []
  }
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    beforeParse (window: any) {
      // Deterministic timers: capture the autoplay callback instead of
      // scheduling real intervals (which would keep the process alive).
      window.setInterval = function (fn: () => void): number {
        ticks.push(fn)
        return ticks.length
      }
      window.clearInterval = function (): void {}
      window.matchMedia = function (): { matches: boolean, addEventListener: (...args: any[]) => void, addListener: (...args: any[]) => void, removeListener: () => void } {
        return {
          matches: mq.matches,
          addEventListener: (type: string, fn: () => void) => { if (type === 'change') mq.listeners.push(fn) },
          addListener: (fn: () => void) => { mq.listeners.push(fn) },
          removeListener: () => {}
        }
      }
    }
  })
  dom.window.eval(utilitiesSource)
  dom.window.document.body.innerHTML = html
  return { dom, ticks, mq }
}

function q (dom: JSDOM, selector: string): Element | null {
  return dom.window.document.querySelector(selector)
}

function activeIndex (dom: JSDOM): number {
  const slides = Array.from(dom.window.document.querySelectorAll('[data-hero-slide]'))
  return slides.findIndex(slide => slide.classList.contains('active'))
}

describe('homepage hero carousel', () => {
  it('zero-slide fallback creates no carousel instance', () => {
    const { dom } = makeHeroDom(heroHtml(0))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    assert.equal(hero.instances.length, 0)
  })

  it('one slide creates no timer and exposes no navigation', () => {
    const { dom } = makeHeroDom(heroHtml(1))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    assert.equal(hero.instances.length, 1)
    const instance = hero.instances[0]
    assert.equal(instance.timer, null)
    assert.equal(instance.root.querySelector('[data-hero-prev]'), null)
    assert.equal(instance.root.querySelector('[data-hero-next]'), null)
    assert.equal(instance.root.querySelector('[data-hero-dot]'), null)
    assert.equal(activeIndex(dom), 0)
  })

  it('next and previous wrap correctly', () => {
    const { dom } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]

    hero.move(instance, 1, 'manual')
    assert.equal(activeIndex(dom), 1)
    hero.move(instance, 1, 'manual')
    assert.equal(activeIndex(dom), 2)
    // Wrap forward.
    hero.move(instance, 1, 'manual')
    assert.equal(activeIndex(dom), 0)
    // Wrap backward.
    hero.move(instance, -1, 'manual')
    assert.equal(activeIndex(dom), 2)
  })

  it('dots select a slide and update aria-current', () => {
    const { dom } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]

    instance.dots[2].click()
    assert.equal(activeIndex(dom), 2)
    assert.equal(instance.dots[2].getAttribute('aria-current'), 'true')
    assert.equal(instance.dots[0].getAttribute('aria-current'), null)
  })

  it('keyboard ArrowLeft/ArrowRight/Home/End navigate while focus is inside', () => {
    const { dom } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    const press = (key: string): void => {
      instance.root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }

    press('ArrowRight')
    assert.equal(activeIndex(dom), 1)
    press('ArrowLeft')
    assert.equal(activeIndex(dom), 0)
    press('End')
    assert.equal(activeIndex(dom), 2)
    press('Home')
    assert.equal(activeIndex(dom), 0)
  })

  it('does not hijack arrow keys while typing in a form control', () => {
    const { dom } = makeHeroDom(heroHtml(3) + '<input id="search" type="text">')
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    const input = q(dom, '#search') as HTMLInputElement
    // Dispatch ON the input so it bubbles to the carousel root with the input
    // as event.target — the handler must not steal the key.
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
    assert.equal(activeIndex(dom), 0)
    assert.equal(instance.slides[0].classList.contains('active'), true)
  })

  it('horizontal swipe navigates, vertical movement does not', () => {
    const { dom } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]

    const swipe = (x1: number, y1: number, x2: number, y2: number): void => {
      const start = new dom.window.Event('touchstart', { bubbles: true })
      Object.defineProperty(start, 'changedTouches', { value: [{ clientX: x1, clientY: y1 }] })
      instance.root.dispatchEvent(start)
      const end = new dom.window.Event('touchend', { bubbles: true })
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: x2, clientY: y2 }] })
      instance.root.dispatchEvent(end)
    }

    // Horizontal left swipe -> next slide.
    swipe(300, 100, 100, 110)
    assert.equal(activeIndex(dom), 1)
    // Predominantly vertical swipe -> ignored.
    swipe(100, 100, 150, 300)
    assert.equal(activeIndex(dom), 1)
  })

  it('reduced motion prevents autoplay entirely', () => {
    const { dom, ticks } = makeHeroDom(heroHtml(3), { reducedMotion: true })
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    assert.equal(instance.timer, null)
    assert.equal(ticks.length, 0)
  })

  it('entering reduced motion after initialization stops autoplay', () => {
    const { dom, mq } = makeHeroDom(heroHtml(3), { reducedMotion: false })
    assert.ok(mq !== null)
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    assert.notEqual(instance.timer, null)

    mq.matches = true
    for (const listener of mq.listeners) listener()
    assert.equal(instance.timer, null)
  })

  it('manual navigation announces the slide; autoplay stays silent', () => {
    const { dom, ticks } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    assert.notEqual(ticks.length, 0)

    // Simulate one autoplay tick.
    const autoplayTick = ticks[ticks.length - 1]
    autoplayTick()
    assert.equal(activeIndex(dom), 1)
    assert.equal(instance.status.textContent, '')

    // Manual navigation announces.
    hero.move(instance, 1, 'manual')
    assert.equal(activeIndex(dom), 2)
    assert.match(instance.status.textContent, /Slide 3 of 3/)
  })

  it('hover and focus pause autoplay and resume when they clear', () => {
    const { dom } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    assert.notEqual(instance.timer, null)

    instance.root.dispatchEvent(new dom.window.Event('mouseenter'))
    assert.equal(instance.timer, null)

    instance.root.dispatchEvent(new dom.window.Event('mouseleave'))
    assert.notEqual(instance.timer, null)

    instance.root.dispatchEvent(new dom.window.Event('focusin'))
    assert.equal(instance.timer, null)

    instance.root.dispatchEvent(new dom.window.Event('focusout'))
    assert.notEqual(instance.timer, null)
  })

  it('the pause control stops and resumes rotation', () => {
    const { dom } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    const play = instance.root.querySelector('[data-hero-play]') as HTMLButtonElement
    const playIcon = play.querySelector('.iconify')
    assert.ok(playIcon !== null)
    assert.notEqual(instance.timer, null)
    // Initial state: pause icon (rotation is running).
    assert.equal(playIcon.getAttribute('data-icon'), 'akar-icons:pause')

    play.click()
    assert.equal(instance.timer, null)
    assert.equal(play.getAttribute('aria-pressed'), 'false')
    assert.equal(play.getAttribute('aria-label'), 'Play automatic rotation')
    // Visible feedback: icon swaps to "play".
    assert.equal(playIcon.getAttribute('data-icon'), 'akar-icons:play')

    play.click()
    assert.notEqual(instance.timer, null)
    assert.equal(play.getAttribute('aria-pressed'), 'true')
    assert.equal(playIcon.getAttribute('data-icon'), 'akar-icons:pause')
  })

  it('hidden document pauses rotation', () => {
    const { dom } = makeHeroDom(heroHtml(3))
    const hero = (dom.window as any).godotLibrary.heroCarousel
    hero.initAll()
    const instance = hero.instances[0]
    assert.notEqual(instance.timer, null)

    instance.documentHidden = true
    hero.syncAutoplay(instance)
    assert.equal(instance.timer, null)

    instance.documentHidden = false
    hero.syncAutoplay(instance)
    assert.notEqual(instance.timer, null)
  })
})
