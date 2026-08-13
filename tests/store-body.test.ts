import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeStoreHtml } from '../src/core/utils/storeBodyRenderer'

describe('sanitizeStoreHtml', () => {
  it('removes scripts, styles, iframes and event handlers', () => {
    const cleaned = sanitizeStoreHtml('<p onclick="alert(1)">hi<script>alert(1)</script></p><style>body{}</style><iframe src="x"></iframe>')
    assert.equal(cleaned, '<p>hi</p>')
  })

  it('removes javascript: and data: URLs', () => {
    const cleaned = sanitizeStoreHtml('<a href="javascript:alert(1)">bad</a><a href="https://ok.example">good</a><img src="data:image/png;base64,AAA">')
    assert.ok(cleaned.includes('https://ok.example'))
    assert.ok(!cleaned.includes('javascript:'))
    assert.ok(!cleaned.includes('data:'))
  })

  it('adds noopener noreferrer nofollow to links', () => {
    const cleaned = sanitizeStoreHtml('<a href="https://example.com">x</a>')
    assert.ok(cleaned.includes('rel="noopener noreferrer nofollow"'))
  })

  it('keeps conservative documentation markup', () => {
    const cleaned = sanitizeStoreHtml('<h2>Title</h2><ul><li>one</li></ul><pre><code>print(1)</code></pre><blockquote>quote</blockquote>')
    assert.ok(cleaned.includes('<h2>Title</h2>'))
    assert.ok(cleaned.includes('<li>one</li>'))
    assert.ok(cleaned.includes('<code>print(1)</code>'))
  })

  it('removes forms, svg, mathml and embedded media', () => {
    const cleaned = sanitizeStoreHtml('<form><input></form><svg><script>alert(1)</script></svg><math><mi>x</mi></math><embed src="x">')
    assert.ok(!cleaned.includes('<form'))
    assert.ok(!cleaned.includes('<svg'))
    assert.ok(!cleaned.includes('<math'))
    assert.ok(!cleaned.includes('<embed'))
  })

  it('returns empty for empty/non-string/oversized input', () => {
    assert.equal(sanitizeStoreHtml(''), '')
    assert.equal(sanitizeStoreHtml('   '), '')
    assert.equal(sanitizeStoreHtml(undefined), '')
    assert.equal(sanitizeStoreHtml(null), '')
    const big = `<p>${'a'.repeat(2 * 1024 * 1024)}</p>`
    assert.equal(sanitizeStoreHtml(big), '')
  })
})
