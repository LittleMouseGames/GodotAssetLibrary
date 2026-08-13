import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStoreAsset } from '../src/app/utilities/fetchFromGodotStore/services/normalizeStoreAsset'
import { StoreAssetDataDetailed, StoreReleaseData } from '../src/app/utilities/fetchFromGodotStore/schema/storeApi'

const cogitoDetail: StoreAssetDataDetailed = {
  slug: 'cogito',
  publisher: { slug: 'philip-drobar', name: 'Philip Drobar', thumbnail: '/static/images/publisher.png', store_url: 'https://store.godotengine.org/publisher/philip-drobar/', verified: true },
  name: 'Cogito',
  type: 0,
  description: 'A complete first-person template.',
  price_cent: 0,
  license_type: 'MIT',
  license_url: 'https://choosealicense.com/licenses/mit/',
  thumbnail: '/static/images/share-image.webp',
  reviews_score: 20,
  tags: [{ slug: 'template', display_name: 'Template', featured: true }],
  store_url: 'https://store.godotengine.org/asset/philip-drobar/cogito/',
  body_html: '<p>Hello <strong>world</strong><script>alert(1)</script></p>',
  body_bbcode: '[b]Hello[/b]',
  source: 'https://codeberg.org/Phazorknight/Cogito',
  media: ['https://asset-store-prod.fra1.digitaloceanspaces.com/cogito/1.png'],
  video_id: 'jFG6GZuHebM',
  video_thumbnail_url: 'https://i.ytimg.com/vi/jFG6GZuHebM/hqdefault.jpg',
  created: '2025-04-29T20:57:31',
  last_updated: '2026-06-16T19:21:53',
  featured: false
}

const cogitoReleases: StoreReleaseData[] = [
  { id: 1204, version: 'v1.1.6', stable: true, size: 43.8218, created: '2026-04-23', min_godot_version: '4.5.1', max_godot_version: null, download_url: 'https://example.invalid/signed?X-Amz-Expires=600' },
  { id: 901, version: 'v1.1.5', stable: true, size: 29.139, created: '2026-01-06', min_godot_version: '4.4', max_godot_version: null }
]

describe('normalizeStoreAsset', () => {
  it('normalizes a Store detail + releases into the shared schema', () => {
    const normalized = normalizeStoreAsset(cogitoDetail, cogitoReleases)
    assert.ok(normalized !== null)

    // Identity
    assert.equal(normalized.provider, 'godot_store')
    assert.equal(normalized.source_asset_id, 'philip-drobar/cogito')
    assert.equal(normalized.source_publisher_slug, 'philip-drobar')
    assert.equal(normalized.source_asset_slug, 'cogito')
    assert.equal(normalized.author, 'Philip Drobar')
    assert.equal(normalized.author_id, 'philip-drobar')

    // Display + category
    assert.equal(normalized.title, 'Cogito')
    assert.equal(normalized.category, 'Templates')
    assert.equal(normalized.type, 'Addon')

    // Compatibility
    assert.equal(normalized.godot_version, '4.5.1')
    assert.equal(normalized.godot_major, 4)
    assert.deepEqual(normalized.godot_majors, [4])
    assert.equal(normalized.version_string, 'v1.1.6')
    assert.equal(normalized.compatibility_ranges.length, 2)

    // Release summaries carry size + notes metadata (regression: size/notes
    // were dropped by the lossy raw mapping before this was fixed).
    assert.equal(normalized.releases.length, 2)
    assert.equal(normalized.releases[0].release_id, 1204)
    assert.equal(normalized.releases[0].version, 'v1.1.6')
    assert.equal(normalized.releases[0].stable, true)
    assert.equal(normalized.releases[0].size_mb, 43.8218)

    // Price / license
    assert.equal(normalized.price_cent, 0)
    assert.equal(normalized.is_free, true)
    assert.equal(normalized.cost, '0')
    assert.equal(normalized.license_type, 'MIT')
    assert.equal(normalized.license_url, 'https://choosealicense.com/licenses/mit/')

    // Rating separation: Store score is NOT merged into local votes
    assert.equal(normalized.source_rating?.score, 20)
    assert.equal(normalized.source_rating?.kind, 'net_vote_score')

    // URLs: relative resolved, credentials stripped, signed download NEVER kept
    assert.equal(normalized.card_banner, 'https://store.godotengine.org/static/images/share-image.webp')
    assert.equal(normalized.browse_url, 'https://codeberg.org/Phazorknight/Cogito')
    assert.equal(normalized.normalized_repository, 'codeberg.org/phazorknight/cogito')
    assert.equal(normalized.store_url, 'https://store.godotengine.org/asset/philip-drobar/cogito/')
    assert.ok(!JSON.stringify(normalized).includes('X-Amz-'))

    // Media: allowlisted CDN image + synthesized video preview
    assert.equal(normalized.previews.length, 2)
    assert.equal(normalized.previews[0].type, 'image')
    assert.equal(normalized.previews[1].type, 'video')
    assert.equal(normalized.previews[1].link, 'https://www.youtube.com/watch?v=jFG6GZuHebM')

    // Body sanitized (script removed)
    assert.equal(normalized.body.sanitized_html, '<p>Hello <strong>world</strong></p>')
    assert.equal(normalized.body.source_format, 'bbcode')

    // Dates parsed as UTC
    assert.equal(normalized.modify_date_at.toISOString(), new Date('2026-06-16T19:21:53Z').toISOString())
    assert.equal(normalized.searchable, 'true')
  })

  it('rejects records with missing publisher/asset slugs or title', () => {
    assert.equal(normalizeStoreAsset({ ...cogitoDetail, slug: '' }, cogitoReleases), null)
    assert.equal(normalizeStoreAsset({ ...cogitoDetail, publisher: { name: 'x' } }, cogitoReleases), null)
    assert.equal(normalizeStoreAsset({ ...cogitoDetail, name: '' }, cogitoReleases), null)
  })

  it('marks a release-less record non-searchable', () => {
    const normalized = normalizeStoreAsset({ ...cogitoDetail, store_url: 'https://store.godotengine.org/asset/philip-drobar/cogito/' }, [])
    assert.ok(normalized !== null)
    assert.equal(normalized.searchable, 'false')
  })

  it('strips credentials from URLs', () => {
    const normalized = normalizeStoreAsset({
      ...cogitoDetail,
      source: 'https://user:pass@github.com/owner/repo'
    }, cogitoReleases)
    assert.ok(normalized !== null)
    assert.equal(normalized.browse_url, '')
  })

  it('does not render non-allowlisted media inline', () => {
    const normalized = normalizeStoreAsset({
      ...cogitoDetail,
      media: ['https://evil.example.com/1.png'],
      featured_thumbnail: 'https://evil.example.com/banner.png',
      thumbnail: 'https://evil.example.com/thumb.png'
    }, cogitoReleases)
    assert.ok(normalized !== null)
    assert.equal(normalized.previews.length, 1) // only the video preview remains
    assert.equal(normalized.card_banner, '')
  })

  it('handles paid price metadata without assuming free', () => {
    const normalized = normalizeStoreAsset({ ...cogitoDetail, price_cent: 499 }, cogitoReleases)
    assert.ok(normalized !== null)
    assert.equal(normalized.price_cent, 499)
    assert.equal(normalized.is_free, false)
    assert.equal(normalized.cost, '\u20AC4.99')
  })
})
