import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  HERO_MAX_SLIDES,
  resolveCuratedProjects,
  resolveCuratedHeroAssets,
  resolveFeaturedAdminRows,
  selectHeroImage
} from '../src/core/utils/homepageHero'

type Doc = Record<string, any>

function legacyDoc (id: string, overrides: Doc = {}): Doc {
  return {
    asset_id: id,
    group_id: id,
    group_preferred: true,
    is_group_root: true,
    is_public: true,
    provider: 'godot_asset_library',
    title: `Legacy ${id}`,
    author: 'Author',
    quick_description: 'A legacy asset',
    category: 'Tools',
    category_lowercase: 'tools',
    godot_version: '3.5',
    godot_major: 3,
    godot_majors: [3],
    card_banner: 'https://example.com/banner.png',
    icon_url: 'https://example.com/icon.png',
    previews: [],
    upvotes: 5,
    downvotes: 1,
    ...overrides
  }
}

function storeDoc (id: string, overrides: Doc = {}): Doc {
  return {
    asset_id: id,
    group_id: id,
    group_preferred: true,
    is_group_root: true,
    is_public: true,
    provider: 'godot_store',
    title: `Store ${id}`,
    author: 'Publisher',
    quick_description: 'A store asset',
    category: 'Tools',
    category_lowercase: 'tools',
    godot_version: '4.2',
    godot_major: 4,
    godot_majors: [4],
    card_banner: 'https://example.com/store-banner.png',
    icon_url: 'https://example.com/store-icon.png',
    previews: [],
    upvotes: 0,
    downvotes: 0,
    source_rating: { score: 12 },
    price_cent: 0,
    is_free: true,
    cost: '0',
    license_type: 'MIT',
    ...overrides
  }
}

describe('resolveCuratedProjects', () => {
  it('preserves curator order and deduplicates configured ids', () => {
    const assets = [
      storeDoc('store-b', { group_id: 'b' }),
      legacyDoc('a'),
      storeDoc('store-a', { group_id: 'a' }),
      legacyDoc('c')
    ]
    // The legacy root comes before its Store sibling, so it wins the slot.
    const { refs, missingIds } = resolveCuratedProjects(['b', 'a', 'store-a', 'c'], assets)
    assert.deepEqual(refs.map(ref => ref.groupId), ['b', 'a', 'c'])
    assert.deepEqual(refs.map(ref => ref.configuredId), ['b', 'a', 'c'])
    assert.deepEqual(missingIds, [])
  })

  it('keeps the first configured id when a sibling precedes its root', () => {
    const assets = [
      legacyDoc('a'),
      storeDoc('store-a', { group_id: 'a' })
    ]
    const { refs } = resolveCuratedProjects(['store-a', 'a'], assets)
    assert.deepEqual(refs.map(ref => ref.groupId), ['a'])
    assert.deepEqual(refs.map(ref => ref.configuredId), ['store-a'])
  })

  it('reports unresolved configured ids', () => {
    const { refs, missingIds } = resolveCuratedProjects(['exists', 'gone', '  '], [legacyDoc('exists')])
    assert.deepEqual(refs.map(ref => ref.groupId), ['exists'])
    assert.deepEqual(missingIds, ['gone'])
  })

  it('handles empty input', () => {
    const { refs, missingIds } = resolveCuratedProjects([], [])
    assert.deepEqual(refs, [])
    assert.deepEqual(missingIds, [])
  })
})

describe('resolveCuratedHeroAssets', () => {
  it('returns slides in curator order regardless of Mongo result order', () => {
    const assets = [legacyDoc('c'), legacyDoc('a'), legacyDoc('b')]
    const slides = resolveCuratedHeroAssets(['a', 'b', 'c'], assets)
    assert.deepEqual(slides.map(slide => slide.groupId), ['a', 'b', 'c'])
  })

  it('converts a stored sibling id to its root group id', () => {
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const root = legacyDoc('legacy1', { group_preferred: false })
    const slides = resolveCuratedHeroAssets(['store1'], [root, store])
    assert.equal(slides.length, 1)
    assert.equal(slides[0].groupId, 'legacy1')
    assert.equal(slides[0].configuredId, 'store1')
  })

  it('deduplicates two configured ids that resolve to the same group', () => {
    const root = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const slides = resolveCuratedHeroAssets(['legacy1', 'store1'], [root, store])
    assert.equal(slides.length, 1)
    assert.equal(slides[0].groupId, 'legacy1')
  })

  it('selects the preferred public variant', () => {
    const root = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const slides = resolveCuratedHeroAssets(['legacy1'], [root, store])
    assert.equal(slides.length, 1)
    assert.equal(slides[0].provider, 'godot_store')
    assert.equal(slides[0].title, 'Store store1')
  })

  it('falls back to an eligible root when the preferred variant mismatches the pinned major', () => {
    const root = legacyDoc('legacy1', { group_preferred: false, godot_major: 3 })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false, godot_major: 4 })
    const slides = resolveCuratedHeroAssets(['legacy1'], [root, store], 3)
    assert.equal(slides.length, 1)
    assert.equal(slides[0].provider, 'godot_asset_library')
    assert.equal(slides[0].title, 'Legacy legacy1')
  })

  it('omits projects with no public compatible variant', () => {
    const hidden = legacyDoc('hidden1', { is_public: false })
    const wrongMajor = legacyDoc('wrong1', { godot_major: 3 })
    const slides = resolveCuratedHeroAssets(['hidden1', 'wrong1', 'gone'], [hidden, wrongMajor], 4)
    assert.deepEqual(slides, [])
  })

  it('uses the globally preferred variant title for the canonical URL slug', () => {
    const root = legacyDoc('root1', { title: 'Root Title', group_preferred: false, godot_major: 3 })
    const store = storeDoc('store1', { group_id: 'root1', title: 'Store Title', group_preferred: true, is_group_root: false, godot_major: 4 })
    // Pinned to 3: only the root is eligible as display variant, but the slug
    // must come from the globally preferred Store variant.
    const slides = resolveCuratedHeroAssets(['root1'], [root, store], 3)
    assert.equal(slides.length, 1)
    assert.equal(slides[0].title, 'Root Title')
    assert.equal(slides[0].canonicalTitle, 'Store Title')
  })

  it('caps the rendered slides at HERO_MAX_SLIDES', () => {
    const ids = Array.from({ length: HERO_MAX_SLIDES + 3 }, (_, i) => `p${i}`)
    const assets = ids.map(id => legacyDoc(id))
    const slides = resolveCuratedHeroAssets(ids, assets)
    assert.equal(slides.length, HERO_MAX_SLIDES)
  })

  it('handles missing and empty input', () => {
    assert.deepEqual(resolveCuratedHeroAssets([], []), [])
    assert.deepEqual(resolveCuratedHeroAssets(['gone'], [legacyDoc('a')]), [])
  })
})

describe('selectHeroImage', () => {
  it('rejects YouTube pages and raw video files as artwork', () => {
    const asset = legacyDoc('a', {
      card_banner: 'https://youtube.com/watch?v=abc123xyz00',
      icon_url: 'https://example.com/icon.png'
    })
    assert.equal(selectHeroImage(asset), 'https://example.com/icon.png')

    const asset2 = legacyDoc('b', {
      card_banner: 'https://example.com/video.mp4',
      icon_url: 'https://example.com/icon2.png'
    })
    assert.equal(selectHeroImage(asset2), 'https://example.com/icon2.png')
  })

  it('prefers a valid card banner', () => {
    const asset = legacyDoc('a', { card_banner: 'https://example.com/hero.png' })
    assert.equal(selectHeroImage(asset), 'https://example.com/hero.png')
  })

  it('falls back through image preview, video poster, icon and placeholder', () => {
    // Image preview first.
    const withImage = legacyDoc('a', {
      card_banner: '',
      previews: [{ link: 'https://example.com/shot.png' }],
      icon_url: ''
    })
    assert.equal(selectHeroImage(withImage), 'https://example.com/shot.png')

    // Video poster when only a YouTube preview exists.
    const withVideo = legacyDoc('b', {
      card_banner: '',
      previews: [{ link: 'https://www.youtube.com/watch?v=abc123xyz00', thumbnail: 'https://i.ytimg.com/vi/abc123xyz00/hqdefault.jpg' }],
      icon_url: ''
    })
    assert.equal(selectHeroImage(withVideo), 'https://i.ytimg.com/vi/abc123xyz00/hqdefault.jpg')

    // Icon fallback.
    const withIcon = legacyDoc('c', { card_banner: '', previews: [], icon_url: 'https://example.com/icon.png' })
    assert.equal(selectHeroImage(withIcon), 'https://example.com/icon.png')

    // Placeholder.
    const empty = legacyDoc('d', { card_banner: '', previews: [], icon_url: '' })
    assert.equal(selectHeroImage(empty), '/images/noimage.png')
  })
})

describe('resolveFeaturedAdminRows', () => {
  it('marks unresolved ids as missing rows for the curator to remove', () => {
    const rows = resolveFeaturedAdminRows(['real1', 'gone'], [legacyDoc('real1')])
    assert.equal(rows.length, 2)
    assert.equal(rows[0].isMissing, false)
    assert.equal(rows[0].groupId, 'real1')
    assert.equal(rows[1].isMissing, true)
    assert.equal(rows[1].groupId, 'gone')
  })

  it('deduplicates rows that resolve to the same group', () => {
    const root = legacyDoc('legacy1', { group_preferred: false })
    const store = storeDoc('store1', { group_id: 'legacy1', group_preferred: true, is_group_root: false })
    const rows = resolveFeaturedAdminRows(['legacy1', 'store1'], [root, store])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].groupId, 'legacy1')
    assert.equal(rows[0].provider, 'godot_store')
  })

  it('flags groups with no public variant', () => {
    const hidden = legacyDoc('hidden1', { is_public: false })
    const rows = resolveFeaturedAdminRows(['hidden1'], [hidden])
    assert.equal(rows[0].isPublic, false)
  })
})
