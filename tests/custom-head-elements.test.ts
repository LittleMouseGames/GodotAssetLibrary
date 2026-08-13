import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateHeadElement,
  validateCustomHeadElements,
  getCustomHeadElements,
  invalidateCustomHeadElementsCache,
  MAX_ELEMENTS,
  MAX_ELEMENT_LENGTH
} from '../src/core/utils/customHeadElements'

describe('validateHeadElement', () => {
  it('accepts a valid meta tag', () => {
    assert.equal(validateHeadElement('<meta name="viewport" content="width=device-width">'), null)
  })

  it('accepts a valid link tag', () => {
    assert.equal(validateHeadElement('<link rel="stylesheet" href="https://example.com/style.css">'), null)
  })

  it('accepts a script tag with src', () => {
    assert.equal(validateHeadElement('<script src="https://example.com/script.js" async></script>'), null)
  })

  it('accepts an inline script tag', () => {
    assert.equal(validateHeadElement('<script>console.log("hello")</script>'), null)
  })

  it('accepts a style tag', () => {
    assert.equal(validateHeadElement('<style>body { color: red; }</style>'), null)
  })

  it('accepts a noscript tag', () => {
    assert.equal(validateHeadElement('<noscript><img src="https://example.com/pixel.gif"></noscript>'), null)
  })

  it('accepts a base tag', () => {
    assert.equal(validateHeadElement('<base href="https://example.com/">'), null)
  })

  it('accepts a title tag', () => {
    assert.equal(validateHeadElement('<title>Custom Title</title>'), null)
  })

  it('rejects an empty string', () => {
    const result = validateHeadElement('')
    assert.ok(result !== null)
    assert.ok(result.includes('empty'))
  })

  it('rejects a string that is only whitespace', () => {
    const result = validateHeadElement('   ')
    assert.ok(result !== null)
    assert.ok(result.includes('empty'))
  })

  it('rejects disallowed tag <div>', () => {
    const result = validateHeadElement('<div>hello</div>')
    assert.ok(result !== null)
    assert.ok(result.includes('div'))
    assert.ok(result.includes('not allowed'))
  })

  it('rejects disallowed tag <span>', () => {
    const result = validateHeadElement('<span>hello</span>')
    assert.ok(result !== null)
    assert.ok(result.includes('span'))
  })

  it('rejects plain text (no opening tag)', () => {
    const result = validateHeadElement('just some text')
    assert.ok(result !== null)
    assert.ok(result.includes('valid HTML opening tag'))
  })

  it('rejects element containing </head>', () => {
    const result = validateHeadElement('<meta name="x"></head><body>injected')
    assert.ok(result !== null)
    assert.ok(result.includes('structural'))
  })

  it('rejects element containing <body>', () => {
    const result = validateHeadElement('<meta name="x"><body>injected</body>')
    assert.ok(result !== null)
    assert.ok(result.includes('structural'))
  })

  it('rejects element containing <html>', () => {
    const result = validateHeadElement('<meta name="x"><html>')
    assert.ok(result !== null)
    assert.ok(result.includes('structural'))
  })

  it('rejects element exceeding max length', () => {
    const tooLong = `<meta content="${'x'.repeat(MAX_ELEMENT_LENGTH + 1)}">`
    const result = validateHeadElement(tooLong)
    assert.ok(result !== null)
    assert.ok(result.includes('maximum length'))
  })

  it('accepts element exactly at max length boundary', () => {
    // Construct a script element whose total length equals MAX_ELEMENT_LENGTH.
    const prefix = '<script>'
    const suffix = '</script>'
    const padding = MAX_ELEMENT_LENGTH - prefix.length - suffix.length
    const el = prefix + 'x'.repeat(padding) + suffix
    assert.equal(el.length, MAX_ELEMENT_LENGTH)
    assert.equal(validateHeadElement(el), null)
  })
})

describe('validateCustomHeadElements', () => {
  it('passes for an empty array', () => {
    assert.doesNotThrow(() => validateCustomHeadElements([]))
  })

  it('passes for a valid array of elements', () => {
    assert.doesNotThrow(() => validateCustomHeadElements([
      '<meta name="robots" content="index,follow">',
      '<link rel="preconnect" href="https://fonts.googleapis.com">'
    ]))
  })

  it('throws when array exceeds MAX_ELEMENTS', () => {
    const elements = Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => `<meta name="x${i}" content="y">`)
    assert.throws(
      () => validateCustomHeadElements(elements),
      (err: any) => err.message.includes('Too many custom head elements')
    )
  })

  it('throws when an individual element is invalid', () => {
    assert.throws(
      () => validateCustomHeadElements(['<meta name="ok">', '<div>bad</div>']),
      (err: any) => err.message.includes('Custom head element 2')
    )
  })
})

describe('customHeadElements cache', () => {
  it('degrades to an empty array instead of throwing when the database is unavailable', async () => {
    // No Mongo connection is established in the test process, so the loader
    // rejects; the cache must return [] rather than propagating the error.
    const elements = await getCustomHeadElements()
    assert.deepEqual(elements, [])
  })

  it('invalidates the cache without throwing', () => {
    assert.doesNotThrow(() => {
      invalidateCustomHeadElementsCache()
    })
  })
})
