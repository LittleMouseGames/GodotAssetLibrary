# Asset Exploration & "Try It" UX Improvement Plan

> **STATUS: IMPLEMENTED** — all phases (1–6) executed and verified (typecheck/lint/tests/build + browser smoke on :8080). See repo memory `implementation-progress.md` for the session-5 summary and gotchas. Items below describe the original plan; all are done.

Goal: make the library easier, better, and nicer to use **for someone browsing assets they want to try or explore**. Everything below uses the existing stack exactly — Express/OvernightJS, TypeScript, Eta templates, Sass, vanilla JS (`window.godotLibrary`), MongoDB 5, Webpack, Docker. **No new npm dependencies.**

The plan is written so a weaker model can implement each item independently: every item lists exact file paths, the data flow, the precise edits (with snippets), edge cases, and how to verify.

---

## 0. Architecture map (read this first)

| Concern | Location |
|---|---|
| Page templates (Eta) | `src/app/code/{module}/views/templates/*.eta` (build copies to `dist/templates/pages/{module}/`) |
| Shared partials | `src/app/components/partials/{name}/` (`asset-card`, `catalog-grid`, `modal-install`, `nav`, `head`, `page-banner`, `page-message`, `footer`, `stars`) |
| Page styles | `src/app/code/{module}/views/styles/styles.scss` (imports shared partial styles) |
| Shared style tokens | `src/app/components/utils/{variables,mixins,forms,body}.scss` |
| Client JS (all of it) | `src/static/javascript/utilities.js` (namespaced `window.godotLibrary`, served statically, no bundling) |
| Backend services | `src/app/code/{module}/services/*.ts` |
| Mongo queries | `src/app/code/{module}/models/**/*.ts` |
| Shared utils | `src/core/utils/*.ts` (`mediaHelpers.ts`, `safeUrl.ts`, `assetUrl.ts`, `escapeHtml.ts`) |
| Tests | `tests/*.test.ts` (`node:test`, compiled to `dist-test/` via `npm run test:build`, run by `npm test`) |

**Card data currently available** (from `GetAssetsFromQuery` projection in `src/app/code/search/models/GET/GetAssetsFromQuery.ts`):
`category, godot_version, author, title, quick_description, icon_url, upvotes, downvotes, rating_score, featured, asset_id, previews, card_banner, modify_date, modify_date_at, added_date, version_string, type, support_level`.

**Asset page data** (`GetAssetDisplayInformation` returns everything except `_id, author_id, category_id, download_provider, searchable, legacy_asset_id, version`): includes `download_url, browse_url, issues_url, cost, description, readme, previews, ...`.

**Verification commands** (always run after changes):
```bash
npm run typecheck
npm run lint:check          # note: `npm run lint` exits 0 by design; use lint:check
npm test
npm run build
# Eta syntax check for any touched template:
node -e "const {compile}=require('eta'); const fs=require('fs'); for (const f of process.argv.slice(1)) compile(fs.readFileSync(f,'utf8'),{filename:f})" src/app/code/search/views/templates/search.eta ...
# Sass check for any touched styles.scss:
npx sass --load-path=src/app src/app/code/search/views/styles/styles.scss /tmp/godot-search.css
```
Styles: component partial styles are **imported** by page styles; edit the partial `styles.scss` and recompile the page that imports it. `npm run devel` (BuildTaskRunner --watch) recompiles on change.

---

## Phase 1 — Discovery grid: make cards scannable and "try-able"

### 1.1 Clamp long descriptions on cards

**Problem:** cards render the full `quick_description` (often multi-paragraph — e.g. "GDScript Complexity Analyzer"). Grid rows have wildly uneven heights; browsing is noisy.

**Files:**
- `src/app/components/partials/asset-card/asset-card.eta`
- `src/app/components/partials/asset-card/styles.scss`

**Template change:** in `asset-card.eta`, the description `<p>` is:
```eta
<p><%= it?.info?.quick_description ?? 'For some reason we\'re unable to load this asset information right now' %></p>
```
Change to:
```eta
<p class="card-description" title="<%= it?.info?.quick_description ?? '' %>"><%= it?.info?.quick_description ?? 'For some reason we\'re unable to load this asset information right now' %></p>
```
(The `title` gives the full text on hover without losing it.)

**SCSS change:** in `asset-card/styles.scss` add (inside the card body block, at the end):
```scss
.card-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  // Older browsers: without -webkit-box support the clamp is ignored and the
  // full paragraph renders (safe fallback).
  @supports not (-webkit-line-clamp: 3) {
    max-height: 4.5em; /* ~3 lines at 1.5 line-height */
  }
}
```
Give the body paragraph a fixed min-height so 1-line descriptions still align with 3-line ones? **No** — leave natural height; uniform min-height only if a single-line looks broken. Verify visually.

**Verify:** homepage, search, related-assets, saved pages show max 3 lines with ellipsis; hover shows full text.

---

### 1.2 Card preview thumbnails (visual "what does it look like")

**Problem:** cards show only a tiny 50px icon; `previews` are already in the grid projection but unused. Previews are the #1 "try it" signal.

**Files:**
- `src/core/utils/mediaHelpers.ts` (add two exported helpers)
- `src/core/utils/cardView.ts` (NEW — shared card enrichment)
- `src/app/code/search/services/SearchService.ts`
- `src/app/code/homepage/services/HomepageService.ts`
- `src/app/code/asset/services/AssetService.ts` (for related assets)
- `src/app/code/dashboard/services/DashboardService.ts` (saved + reviews pages — find the file under `src/app/code/dashboard/services/`)
- `src/app/components/partials/asset-card/asset-card.eta`
- `src/app/components/partials/asset-card/styles.scss`

**Step A — helper in `mediaHelpers.ts`** (reuse existing `normalizePreviews`):
```ts
export interface CardPreviewThumb {
  url: string
  type: 'image' | 'video'
}

/**
 * Up to `max` safe thumbnail URLs for card grids. Reuses normalizePreviews so
 * unsafe/non-http(s) URLs are dropped and videos are still identifiable.
 */
export function getCardPreviews (asset: { previews?: unknown }, max = 3): CardPreviewThumb[] {
  return normalizePreviews(asset?.previews)
    .filter((item): item is MediaItem & { type: 'image' | 'video' } => item.type === 'image' || item.type === 'video')
    .slice(0, max)
    .map(item => ({ url: item.thumbnail || item.url, type: item.type }))
}
```

**Step B — NEW file `src/core/utils/cardView.ts`** (DRY: every grid renderer attaches card extras):
```ts
import { getCardPreviews } from './mediaHelpers'
import { isSafeHttpUrl } from './safeUrl'

/**
 * Enrich grid-card asset objects before render:
 * - cardPreviews: sanitized preview thumbnails (safe URLs only)
 * - download_url: blanked unless it is a safe http(s) URL (mirrors the asset page)
 */
export function attachCardExtras (assets: Array<Record<string, unknown>>): void {
  for (const asset of assets) {
    asset.cardPreviews = getCardPreviews(asset)
    if (!isSafeHttpUrl(asset.download_url)) asset.download_url = ''
  }
}
```
Note: `isSafeHttpUrl` accepts `unknown` — verify its signature in `src/core/utils/safeUrl.ts` and pass `asset.download_url`.

**Step C — call it in every service that renders cards.**
- `SearchService.render`: after `const [assets, totalAssetsForQuery, facets] = await Promise.all(...)`, call `attachCardExtras(assets)` before the `authToken` saved-marking loop.
- `HomepageService.render`: call `attachCardExtras(trendingAssets)`, `attachCardExtras(featuredAssets)`, `attachCardExtras(lastModifiedAssets)` before the saved-marking loop.
- `AssetService.render`: call `attachCardExtras(relatedAssets)` after `relatedAssets = await GetRelatedAssets(...)`.
- Dashboard saved/reviews services: call `attachCardExtras(...)` on their asset arrays (find the render method that populates `grid`).

**Step D — template** in `asset-card.eta`, inside `<div class="body">`, directly above the description `<p>`:
```eta
<% if (it?.info?.cardPreviews?.length > 0) { %>
<div class="card-previews" aria-hidden="true">
  <% it.info.cardPreviews.forEach(p => { %>
  <img class="card-preview<%= p.type === 'video' ? ' has-video' : '' %>"
    src="<%= generateProxyUrl(p.url, 160, 90) %>"
    data-src="<%= generateProxyUrl(p.url) %>"
    data-fallback-image="<%= p.url %>"
    alt="" loading="lazy" decoding="async" class="lazyload">
  <% }) %>
</div>
<% } %>
```
`aria-hidden="true"` + `alt=""` because the preview is decorative (the card title/description carry the meaning).

**Step E — SCSS** in `asset-card/styles.scss`:
```scss
.card-previews {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 10px;

  .card-preview {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: $border-radius-sm;
    background: $color-lighter-gray;
    border: 1px solid $border-color;

    &.has-video::after {
      // play glyph overlay (see note below — simplest is a background image)
    }
  }

  // 1-2 previews: don't stretch them weirdly
  img:only-child {
    grid-column: 1 / -1;
  }
}
```
For the video play badge, the simplest robust approach without iconify in SCSS: render a tiny SVG **in the template** only for video entries:
```eta
<div class="card-preview-wrap">
  <img ... class="card-preview lazyload">
  <% if (p.type === 'video') { %><span class="card-preview-play" aria-hidden="true">&#9654;</span><% } %>
</div>
```
Wrap the img in a `.card-preview-wrap` (position: relative) and style `.card-preview-play` as a centered translucent circle with a white ▶. Keep it small (18px).

**Edge cases:** assets with no previews render nothing (no empty box). Non-http URLs are dropped by `normalizePreviews`. Fallback: lazysizes `data-fallback-image` already handles broken remote images (see the global `error` handler in `utilities.js`).

**Verify:** search grid, homepage sections, related assets, saved page all show up to 3 preview thumbnails; no console errors; grid stays tidy.

---

### 1.3 Card quick "Download" action (try it fast)

**Problem:** to try an asset today you must open the asset page and find Download ZIP. A direct download affordance on the card serves the "try it" intent.

**Files:**
- `src/app/code/search/models/GET/GetAssetsFromQuery.ts` (add `download_url` to projection)
- `src/app/components/partials/asset-card/asset-card.eta`
- `src/app/components/partials/asset-card/styles.scss`

**Step A — projection:** add `download_url: 1` to `SEARCH_FIELDS_PROJECTION` in `GetAssetsFromQuery.ts`.

**Step B — template:** in the card footer, change the single CTA into a pair:
```eta
<div class="footer">
  <div class="rating"> ... unchanged ... </div>
  <div class="card-actions-cta">
    <% if (typeof it?.info?.download_url === 'string' && it.info.download_url !== '') { %>
    <a class="card-download" href="<%= it.info.download_url %>" target="_blank" rel="noopener noreferrer"
      title="Download <%= it?.info?.title ?? 'asset' %> ZIP archive">Download</a>
    <% } %>
    <a class="card-cta" href="<%= assetHref %>" title="Open <%= it?.info?.title ?? 'asset' %> details">View details</a>
  </div>
</div>
```
(`attachCardExtras` from 1.2 guarantees `download_url` is a safe http(s) URL or `''`.)

**Step C — SCSS:** `.card-actions-cta { display: flex; gap: 8px; align-items: center; }`, `.card-download` styled as a secondary button (white bg, border, small), `.card-cta` keeps primary style. On small screens stack or shrink.

**Edge cases:** no `download_url` → no Download button (only "View details"). `target="_blank"` + `rel="noopener noreferrer"` to avoid tab-nabbing and referrer leakage.

**Verify:** every card with a download URL shows Download; clicking opens the ZIP in a new tab; cards without one only show View details.

---

### 1.4 Compact rating summary (small polish)

**Problem:** cards render "No ratings yet" twice (visible + visually-hidden duplicate is fine, but the footer row is wide and noisy). Make it one compact line with an icon.

**Files:** `asset-card.eta`, `asset-card/styles.scss`

**Template:** in the footer `.rating`, render:
```eta
<span class="rating-summary">
  <span class="iconify" data-icon="bi:hand-thumbs-up-fill" aria-hidden="true"></span>
  <%= total > 0 ? `${approval}% approval · ${total} rating${total === 1 ? '' : 's'}` : 'No ratings yet' %>
</span>
```
and keep the existing `<span class="visually-hidden"><%= ratingDetail %></span>`.

**Verify:** single compact rating line per card; screen reader still gets full detail.

---

## Phase 2 — Asset page: make "try & install" effortless

### 2.1 Sticky action bar (primary actions always visible)

**Problem:** actions (Download, Install help, Save) sit in the right sidebar; while reading a long README they scroll away.

**Files:**
- `src/app/code/asset/views/templates/view.eta`
- `src/app/code/asset/views/styles/styles.scss`

**Template:** inside `.page-asset`, at the very top (before `.asset-context-bar`), add:
```eta
<div class="asset-action-bar">
  <div class="action-title">
    <span class="action-icon"><img src="<%= generateProxyUrl(it?.info?.icon_url ?? '', 32, 32) %>" alt="" loading="lazy"></span>
    <span class="action-name"><%= it?.info?.title ?? 'Asset' %></span>
  </div>
  <div class="action-buttons">
    <% const dl = it?.info?.download_url ?? '' %>
    <% if (typeof dl === 'string' && dl !== '') { %>
    <a class="action primary" href="<%= dl %>" target="_blank" rel="noopener noreferrer"
      title="Download the asset ZIP archive">Download ZIP</a>
    <% } %>
    <button class="action secondary" type="button" data-dialog-open="install"
      title="Open installation instructions">Install help</button>
    <button class="action secondary" type="button" data-copy-text="<%= it?.info?.title ?? '' %>"
      title="Copy the asset name to paste into Godot's AssetLib tab">Copy name</button>
    <% if (it?._locals?.loggedIn === true) { %>
    <button type="button" class="action save-toggle" data-save-asset="<%= it?.info?.asset_id %>"
      data-saved="<%= it?.info?.saved === true ? 'true' : 'false' %>"
      aria-pressed="<%= it?.info?.saved === true ? 'true' : 'false' %>">
      <%= it?.info?.saved === true ? 'Unsave' : 'Save' %>
    </button>
    <% } %>
  </div>
</div>
```
Note: the existing save-toggle handler in `utilities.js` is a delegated listener on `[data-save-asset]` — it will work here automatically.

**SCSS:** `.asset-action-bar` → `position: sticky; top: 12px; z-index: $z-sticky;` (see `variables.scss` for `$z-sticky: 100`), white card, shadow (`$shadow-md`), flex between title and buttons, wraps on mobile, buttons use the existing `.action` styles from the quick-info card (copy that pattern). Add `scroll-margin-top` awareness is not needed (it's sticky, not anchor).

**Verify:** while scrolling the README, the bar stays visible; Download/Install/Copy/Save work; wraps nicely on mobile.

---

### 2.2 Install modal: copy buttons + AssetLib hint + license/compat

**Files:**
- `src/app/components/partials/modal-install/modal-install.eta`
- `src/app/components/partials/modal-install/styles.scss`
- `src/static/javascript/utilities.js` (add `clipboard` namespace + wire `[data-copy-text]`)

**Template changes** in `modal-install.eta`:

1. Add a **"install in Godot" copy block** at the top of the grid:
```eta
<div class="install-via-godot">
  <h3>Quickest: install from inside Godot</h3>
  <p>In the Godot editor, open the <strong>AssetLib</strong> tab and search for
  &ldquo;<strong><%= assetTitle %></strong>&rdquo;, then press Download.</p>
  <button type="button" class="copy-btn" data-copy-text="<%= assetTitle %>">Copy asset name</button>
</div>
```

2. Add a **compatibility/license line** (uses fields that exist):
```eta
<p class="compat">
  Godot <strong><%= it?.info?.godot_version ?? 'unknown' %></strong>
  <% if (it?.info?.version_string) { %>&middot; asset version v<%= it?.info?.version_string %><% } %>
  <% const cost = String(it?.info?.cost ?? '0') %>
  &middot; <%= cost === '' || cost === '0' ? 'Free' : cost %>
  &middot; <%= it?.info?.support_level ? (it.info.support_level + ' support') : 'community' %>
</p>
```
(Replace the existing `.compat` block.)

3. Add **copy buttons** next to each manual-install paragraph:
```eta
<button type="button" class="copy-btn" data-copy-text="Install instructions for '<%= assetTitle %>'...">Copy instructions</button>
```
Simplest robust approach: one copy button that copies the whole manual-install `<p>` text. Give that `<p>` an id (`id="manual-install-text"`) and use `data-copy-selector="#manual-install-text"` so the JS copies the element's text.

**JS — add to `utilities.js`** a `clipboard` namespace and a delegated click handler:
```js
clipboard: {
  copyText: function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text)
    }
    // Fallback for non-secure contexts
    return new Promise(function (resolve, reject) {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'absolute'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'))
      } catch (e) { reject(e) }
      document.body.removeChild(ta)
    })
  }
}
```
Then in the existing delegated `document.addEventListener('click', ...)` block (the one handling `[data-dialog-open]`), add a branch **before** it:
```js
const copyTrigger = target.closest('[data-copy-text], [data-copy-selector]')
if (copyTrigger !== null) {
  event.preventDefault()
  const text = copyTrigger.hasAttribute('data-copy-text')
    ? copyTrigger.getAttribute('data-copy-text')
    : (document.querySelector(copyTrigger.getAttribute('data-copy-selector'))?.textContent ?? '')
  const btn = copyTrigger
  const original = btn.textContent
  window.godotLibrary.clipboard.copyText(text).then(() => {
    btn.textContent = 'Copied!'
    window.godotLibrary.pageMessages.addPageMessage('Copied to clipboard')
  }).catch(() => {
    window.godotLibrary.pageMessages.addPageMessage('Could not copy — select the text manually')
  }).finally(() => {
    window.setTimeout(() => { btn.textContent = original }, 2000)
  })
  return
}
```

**SCSS:** `.copy-btn` small ghost button; `.install-via-godot` highlighted box (light blue background using `$color-info` with low opacity, or `$color-lighter-gray`).

**Verify:** on the asset page, "Install help" opens the modal; Copy asset name puts the title on the clipboard; Copy instructions copies the paragraph; "Copied!" feedback shows; works on http://localhost (insecure context → fallback path).

---

### 2.3 Compatibility + meta callout under the title

**Problem:** engine version, type, support level and cost are in the sidebar only. A quick "does this work for me?" line near the top answers the first question a trier asks.

**Files:**
- `src/app/code/asset/views/templates/view.eta`
- `src/app/code/asset/views/styles/styles.scss`

**Template:** in the `.column` right after `<div class="media...">`'s closing `</div>` (before `<div class="info">`), add:
```eta
<div class="asset-meta-callout">
  <span class="meta-pill pill-engine">Godot <%= it?.info?.godot_version ?? '?' %></span>
  <% if (it?.info?.type) { %><span class="meta-pill pill-type"><%= it.info.type %></span><% } %>
  <% if (it?.info?.support_level && it.info.support_level !== 'None') { %><span class="meta-pill pill-support"><%= it.info.support_level %> support</span><% } %>
  <span class="meta-pill pill-free">Free</span>
  <% if (typeof it?.info?.browse_url === 'string' && it.info.browse_url !== '') { %>
  <a class="meta-link" href="<%= it.info.browse_url %>" target="_blank" rel="noopener noreferrer">Source code ↗</a>
  <% } %>
</div>
```

**SCSS:** `.asset-meta-callout { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 14px 0; }`, pills = small rounded chips (reuse badge palette: `$badge-blue`, `$badge-purple`, plus neutral gray; "Free" in green `$color-success`-tinted).

**Verify:** meta row shows under the media on desktop and mobile; source link opens repo.

---

### 2.4 Media gallery polish (video badges + image count)

**Files:**
- `src/app/code/asset/views/templates/view.eta` (thumbnails loop)
- `src/app/code/asset/views/styles/styles.scss`

**Template:** in the thumbnails loop, add a video play badge and count:
```eta
<button type="button" class="thumbnail-btn<%= index === 0 ? ' active' : '' %> ...">
  <span class="thumb-wrap">
    <img ...>
    <% if (item.type === 'video') { %><span class="thumb-play" aria-hidden="true">&#9654;</span><% } %>
  </span>
</button>
```
And in the player container, when `mediaItems.length > 1`, show an "N previews" badge over the primary image:
```eta
<% if (mediaItems.length > 1) { %><span class="media-count-badge" aria-hidden="true"><%= mediaItems.length %> previews</span><% } %>
```

**SCSS:** `.thumb-wrap { position: relative; display: block; }`, `.thumb-play` small centered translucent circle with ▶, `.media-count-badge` positioned bottom-right of `.player`.

**Verify:** video thumbnails show a play glyph; primary image shows "N previews" badge; existing lightbox/thumbnail switching unaffected.

---

### 2.5 Reviews: visible social proof + anchor

**Problem:** ratings/reviews sit at the very bottom of a long page; a trier never sees social proof.

**Files:**
- `src/app/code/asset/views/templates/view.eta`
- `src/app/code/asset/views/templates/quick-info.eta`
- `src/app/code/asset/views/styles/styles.scss`

**Changes:**
1. Give the reviews section an id and `scroll-margin-top`: `<div class="section" id="reviews">` and in SCSS `#reviews { scroll-margin-top: 80px; }` (plus `html { scroll-behavior: smooth; }` in `body.scss`).
2. In `quick-info.eta`, under the stars, add a link when reviews exist:
```eta
<% if (it?.reviewCount != null && it.reviewCount > 0) { %>
<a class="reviews-anchor" href="#reviews" title="Jump to reviews">
  <%= it.reviewCount %> review<%= it.reviewCount === 1 ? '' : 's' %>
</a>
<% } %>
```
3. Optionally move the "Your Rating" form summary line ("N total reviews") up: it's already in the reviews section; keep as is — the anchor is enough.

**Verify:** quick-info shows a "5 reviews" link; clicking smooth-scrolls to the reviews section; anchor works from mobile quick-info too (both quick-info copies are the same partial, so it works in both).

---

## Phase 3 — Search: faster filtering, clearer state, less paging

### 3.1 Collapsible filter panel on desktop + persisted state

**Problem:** the 17%-width filter sidebar is always expanded on desktop; users who don't filter lose column space and the "Apply filters" button is far away.

**Files:**
- `src/app/code/search/views/templates/search.eta`
- `src/app/code/search/views/styles/styles.scss`
- `src/static/javascript/utilities.js`

**Template:** add a visible toggle on desktop too. Give the existing `.filters-toggle` button a `data-filter-persist` attribute and show it at all widths (SCSS change below). It already calls `window.godotLibrary.search.toggleFilters`.

**JS:** extend `search.toggleFilters` to persist state:
```js
toggleFilters: function (event) {
  const form = document.getElementById('search-filters-form')
  const button = event?.currentTarget
  if (form === null) return
  const isOpen = form.classList.contains('open')
  const next = !isOpen
  form.classList.toggle('open', next)
  button?.setAttribute('aria-expanded', next ? 'true' : 'false')
  try { window.localStorage.setItem('godot-search-filters-open', next ? '1' : '0') } catch (e) { /* ignore */ }
  if (next) {
    const firstInput = form.querySelector('input:not([type="hidden"])')
    if (firstInput instanceof HTMLElement) firstInput.focus()
  }
}
```
And on `DOMContentLoaded`, add:
```js
;(function restoreFilterState () {
  const form = document.getElementById('search-filters-form')
  if (form === null || window.matchMedia('(max-width: 767px)').matches) return
  let open = true
  try { open = window.localStorage.getItem('godot-search-filters-open') !== '0' } catch (e) { /* ignore */ }
  if (!open) {
    form.classList.remove('open')
    const button = document.querySelector('.filters-toggle')
    button?.setAttribute('aria-expanded', 'false')
  }
})()
```

**SCSS:** in `search/views/styles/styles.scss`:
- Move the `.filters-toggle` rules out of the `mobile-styles` block so the toggle shows on desktop too; give it the same button look (border, radius, weight) plus `margin-bottom: 12px`.
- The available responsive mixins are `small-desktop-styles`, `tablet-styles`, `mobile-styles`, `small-mobile-styles` (see `mixins.scss` — there is **no** `desktop-styles` mixin; don't invent one). Use the available breakpoints:
  - Default (desktop): `.catalog-filters { display: block; }` and `.catalog-filters:not(.open) { display: none; }` — i.e. default **open**, JS toggles `.open`.
  - Inside `@include mobile-styles`: `.catalog-filters { display: none; }` and `.catalog-filters.open { display: block; }` — default **collapsed** on mobile.
- The `.accordion-content` rules stay as they are (desktop expanded / mobile collapsed accordions) — this change only collapses the whole filter **panel**.
- Template: give the form a default-open class on desktop: `<form method="GET" action="/search/" class="catalog-filters open" id="search-filters-form">`. The JS in step 3.1 toggles `.open` and persists it; on `DOMContentLoaded` it removes `open` when the saved state is `0`. One class, one convention.

**Verify:** desktop can collapse/expand filters (persisted across reloads); mobile behavior unchanged (default collapsed, "Filters (N)" toggle); accordion sections still work.

---

### 3.2 Active-filter chips bar above results

**Problem:** active chips live at the top of the filter sidebar; when the sidebar is collapsed, users can't see what's filtering.

**Files:**
- `src/app/code/search/views/templates/search.eta`
- `src/app/code/search/views/styles/styles.scss`

**Template:** move the `.active-filters` block from inside `.filters-column` to directly above the results `<section>` (sibling of `.filters-column`), e.g.:
```eta
<% if (it.search?.chips?.length > 0) { %>
<div class="active-filters active-filters-bar">
  ...same chips markup...
</div>
<% } %>
```
Keep it outside both columns so it spans full width. (Chips markup is unchanged; reuse it verbatim.)

**SCSS:** `.active-filters-bar { grid-column: 1 / -1; margin-bottom: 14px; }` (the `.page-search` is a grid — see `search/views/styles/styles.scss`), remove the old `margin-left` that assumed sidebar placement.

**Verify:** with filters selected, chips appear above the grid full-width with working remove links and Clear all; when sidebar is collapsed the state is still visible.

---

### 3.3 Instant-apply checkboxes (JS convenience, no-JS fallback)

**Files:** `src/app/code/search/views/templates/search.eta`

**Change:** on every filter checkbox input (`category`, `engine`, `type`, `support`, and the `featured` checkbox), add:
```eta
onchange="this.form.submit()"
```
Example for categories:
```eta
<input type="checkbox" name="category" value="<%= category.value %>"
  <%= category.checked ? 'checked' : '' %> onchange="this.form.submit()">
```
Keep the "Apply filters" submit button (no-JS and keyboard users). Hidden `q`, `sort`, `limit` inputs already preserve state.

**Edge case:** on mobile with the panel collapsed, checking is impossible anyway; the button remains the fallback. Do **not** add `onchange` to the "Featured only" label if it causes a double-submit — test it; if the label wraps the input, the change event still fires once.

**Verify:** checking a filter reloads the page with the filter applied and the checkbox state persisted (because it's a GET with the value in the URL).

---

### 3.4 "Load more" incremental pagination

**Problem:** 12 cards per page with page-number jumps; exploring means many reloads. Add a "Load more" button that appends the next page via fetch. Canonical pagination stays for deep-linking/no-JS.

**Files:**
- `src/app/components/partials/asset-card-grid/results.eta` (NEW — extracted card loop)
- `src/app/components/partials/catalog-grid/catalog-grid.eta` (use the partial; add Load more button)
- `src/app/code/search/views/templates/search-partial.eta` (NEW — bare template that renders just the cards)
- `src/app/code/search/controllers/SearchController.ts` (new GET route)
- `src/app/code/search/services/SearchService.ts` (new `renderLoadMore`)
- `src/app/code/search/services/buildSearchViewModel.ts` (ensure `pagination.nextUrl` — already exists)
- `src/static/javascript/utilities.js` (new `loadMore` namespace)
- `src/app/code/search/views/styles/styles.scss` (button style)

**Step A — extract the card loop.** Create `src/app/components/partials/asset-card-grid/results.eta`:
```eta
<% it.grid?.forEach(info => { %>
  <% if (it?.type && it?.type === 'reports') { %>
  <%~ includeFile('templates/components/partials/review-report/review-report.eta', info) %>
  <% } else { %>
  <%~ includeFile('templates/components/partials/asset-card/asset-card.eta', { info: info, _locals: it?._locals, sourceUrl: it?.sourceUrl }) %>
  <% } %>
<% }) %>
```
In `catalog-grid.eta`, replace the existing `<div class="results"> ...card loop... </div>` with:
```eta
<div class="results">
  <%~ includeFile('templates/components/partials/asset-card-grid/results.eta', { grid: it.grid, type: it?.type, _locals: it?._locals, sourceUrl: it?.params }) %>
</div>
```
(Note: pass `sourceUrl` from `it.params` — the current request URL — so card `?from=` links keep working.)

**Step B — the bare partial** `src/app/code/search/views/templates/search-partial.eta`:
```eta
<%~ includeFile('templates/components/partials/asset-card-grid/results.eta', { grid: it.grid, type: it?.type, _locals: it?._locals, sourceUrl: it.sourceUrl }) %>
```
(No `layout()` call → Eta renders it bare; it is never wrapped in the page shell.)

**Step C — controller route** in `SearchController.ts`:
```ts
@Get('/load-more/')
@Middleware(searchRateLimit)
private async loadMore (req: Request, res: Response): Promise<void> {
  return await this.SearchService.renderLoadMore(req, res)
}
```

**Step D — service method** in `SearchService.ts`:
```ts
public async renderLoadMore (req: Request, res: Response): Promise<void> {
  const parsed = parseSearchRequest(req)
  const filterOptions: SearchFilterOptions = { ... } // same as render()

  const [assets, totalAssetsForQuery] = await Promise.all([
    GetAssetsFromQuery(parsed.query, parsed.limit, parsed.skip, parsed.sort, filterOptions),
    GetAssetsCountFromQuery(parsed.query, filterOptions)
  ])

  // Out-of-range page: return empty payload instead of redirecting.
  if (parsed.page > 0 && assets.length === 0 && totalAssetsForQuery > 0) {
    res.json({ html: '', hasNext: false, nextUrl: '' })
    return
  }

  // Mark saved for logged-in users (mirror the block in render()).
  const authToken = striptags(req.cookies['auth-token'] ?? '')
  if (authToken !== '') {
    const tokenServices = TokenServices.getInstance()
    const hashedToken = tokenServices.hashToken(authToken)
    try {
      const userSaved = await GetUserSavedAssets(hashedToken)
      for (const asset of assets) asset.saved = userSaved.includes(asset.asset_id)
    } catch (e) { /* ignore */ }
  }

  attachCardExtras(assets)

  // The "from" back-link should point at the *first* page, not page=N.
  const cleanUrl = new URL(req.originalUrl, 'http://local')
  cleanUrl.searchParams.delete('page')
  const sourceUrl = cleanUrl.pathname + cleanUrl.search

  const totalPages = Math.max(1, Math.ceil(totalAssetsForQuery / parsed.limit))
  const hasNext = parsed.page < totalPages - 1
  const nextUrl = hasNext
    ? buildSearchUrl({ query: parsed.query, categories: parsed.categories, engines: parsed.engines, types: parsed.types, supports: parsed.supports, featured: parsed.featured, sort: parsed.sort, limit: parsed.limit, page: parsed.page + 1 })
    : ''

  res.set('Cache-Control', 'public, max-age=60')
  res.render('templates/pages/search/search-partial', {
    grid: assets,
    sourceUrl,
    _locals: res.locals
  }, (err: Error | null, html: string) => {
    if (err) throw err
    res.json({ html, hasNext, nextUrl })
  })
}
```
(Imports to add: `attachCardExtras` from `core/utils/cardView`, `buildSearchUrl` from `./buildSearchViewModel` — already imported. `GetUserSavedAssets` already imported.)

**Step E — Load more button** in `catalog-grid.eta`, right after `</div>` of `.results` and before `.bottom-bar`, only when there is a next page:
```eta
<% if (it?.search?.pagination?.hasNext === true) { %>
<button type="button" class="load-more" data-load-more data-next-url="<%= it.search.pagination.nextUrl %>">
  Load more assets
</button>
<% } %>
```
Set `aria-busy` on it during fetch.

**Step F — JS** in `utilities.js`:
```js
loadMore: {
  init: function () {
    const button = document.querySelector('[data-load-more]')
    if (button === null) return
    button.addEventListener('click', function () {
      window.godotLibrary.loadMore.fetchNext(button)
    })
  },
  fetchNext: function (button) {
    const nextUrl = button.getAttribute('data-next-url')
    if (nextUrl === null || nextUrl === '') return
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
    fetch(nextUrl, { headers: { Accept: 'application/json' } })
      .then(function (response) { return response.json() })
      .then(function (data) {
        if (!data.html) return
        const results = document.querySelector('.catalog-grid .results')
        if (results === null) return
        results.insertAdjacentHTML('beforeend', data.html)
        if (typeof window.lazySizes !== 'undefined') window.lazySizes.updateAll()
        if (data.hasNext && data.nextUrl) {
          button.setAttribute('data-next-url', data.nextUrl)
        } else {
          button.remove()
          const done = document.createElement('p')
          done.className = 'load-more-done'
          done.textContent = 'All assets loaded'
          button.parentNode?.insertBefore(done, button.nextSibling)
          button.remove()
        }
      })
      .catch(function () {
        window.godotLibrary.pageMessages.addPageMessage('Could not load more assets, please try again')
      })
      .finally(function () {
        button.disabled = false
        button.removeAttribute('aria-busy')
      })
  }
}
```
Wire it in the existing `DOMContentLoaded` handler: `window.godotLibrary.loadMore.init()`.

**Edge cases:** the load-more fetch URL is the same GET form URL with `page=2` → same rate limit, same filters. New cards include `[data-save-asset]` buttons → already handled by delegated listeners. New images → `lazySizes.updateAll()`. The page-number nav and Load more coexist.

**Step G — SCSS:** `.load-more { display:block; margin: 20px auto; padding: 10px 28px; border:1px solid $border-color-strong; border-radius:$border-radius-md; background:$color-brand-white; font-weight:600; cursor:pointer; }` plus `&[aria-busy="true"] { opacity:.6; cursor:progress; }`.

**Verify:** search page shows Load more; clicking appends 12 more without reload; URL does not change (progressive enhancement); Back links from loaded cards return to page 1 of the search; JS disabled → normal pagination still works.

---

### 3.5 `/` keyboard shortcut to focus search

**Files:** `src/static/javascript/utilities.js`

Add to the existing `keydown` listeners:
```js
document.addEventListener('keydown', function (event) {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  if (target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable)) return
  const input = document.getElementById('site-search')
  if (input !== null) {
    event.preventDefault()
    input.focus()
    input.select()
  }
})
```

**Verify:** pressing `/` anywhere (except when typing) focuses the nav search and selects its text.

---

### 3.6 Recent searches (datalist + chips)

**Files:**
- `src/static/javascript/utilities.js`
- `src/app/components/partials/nav/nav.eta`
- `src/app/code/search/views/templates/search.eta`
- `src/app/code/search/views/styles/styles.scss`

**JS** — add a `search.remember` helper:
```js
remember: {
  key: 'godot-recent-searches',
  read: function () {
    try { return JSON.parse(window.localStorage.getItem(this.key) ?? '[]') } catch (e) { return [] }
  },
  push: function (query) {
    if (!query) return
    let list = this.read().filter(function (q) { return q !== query })
    list.unshift(query)
    list = list.slice(0, 5)
    try { window.localStorage.setItem(this.key, JSON.stringify(list)) } catch (e) { /* ignore */ }
  },
  init: function () {
    // Remember the current search query on the search page.
    const params = new URLSearchParams(window.location.search)
    const q = (params.get('q') ?? '').trim()
    if (q !== '') this.push(q)
    // Populate the datalist in the nav.
    const dl = document.getElementById('recent-searches')
    if (dl !== null) {
      this.read().forEach(function (term) {
        const opt = document.createElement('option')
        opt.value = term
        dl.appendChild(opt)
      })
    }
    // Render "Recent" chips on the search page (when there is a query or none).
    const box = document.getElementById('recent-searches-box')
    if (box !== null) {
      const terms = this.read()
      if (terms.length > 0) {
        terms.forEach(function (term) {
          const a = document.createElement('a')
          a.href = '/search/?q=' + encodeURIComponent(term)
          a.className = 'chip'
          a.textContent = term
          box.appendChild(a)
        })
      }
    }
  }
}
```
Call `window.godotLibrary.search.remember.init()` in `DOMContentLoaded`.

**Templates:**
- `nav.eta`: add `<datalist id="recent-searches"></datalist>` right after the search `<input>` (datalist must be a sibling, not inside the input).
- `search.eta`: add a "Recent" chips row above the results section (next to the active-filters bar):
```eta
<div class="recent-searches" id="recent-searches-box" aria-label="Recent searches"></div>
```
(Only visible when JS populates it; hide the empty container with `:empty { display:none; }`.)

**SCSS:** `.recent-searches { display:flex; flex-wrap:wrap; gap:8px; margin: 0 0 14px; }` and `&:empty { display:none; }`; chips reuse `.chip` styles.

**Verify:** after searching "shader", the nav search shows a dropdown suggestion "shader"; search page shows a Recent chips row; max 5, no duplicates.

---

### 3.7 Relabel engine filters

**Files:** `src/app/code/search/views/templates/search.eta`

Change the accordion heading `Engine Filters` → `Godot Version`. (The data is engine versions; "Godot Version" is what a trier thinks in.)

**Verify:** label shows "Godot Version".

---

## Phase 4 — Homepage

### 4.1 Remove duplicate H1 (banner + hero)

**Problem:** the page-banner renders its default H1 "Kickstart Projects with Free Godot Assets" AND the hero renders its own H1 → two H1s, redundant visuals, weak SEO.

**Files:**
- `src/app/components/partials/page-banner/page-banner.eta`
- `src/app/code/homepage/services/HomepageService.ts`
- `src/app/code/homepage/views/styles/styles.scss` (add top spacing since banner is gone)

**Template:** in `page-banner.eta`, short-circuit when the page opts out:
```eta
<% if (it?.hidePageBanner === true) { return } %>
```
At the very top of the file (before the `var` block that builds the image).

**Service:** `HomepageService.render` adds `hidePageBanner: true` to the `res.render(...)` data.

**SCSS:** `.page-home` gets `margin-top: $space-5;` (it may already be fine — verify visually the hero no longer crowds the nav).

**Verify:** homepage has exactly one `<h1>`; search/asset pages still show their banner H1.

---

### 4.2 Category quick-rail under the hero

**Files:**
- `src/app/code/homepage/views/templates/index.eta`
- `src/app/code/homepage/views/styles/styles.scss`

**Template:** under the hero section, add:
```eta
<div class="category-rail" aria-label="Browse by category">
  <% for (const [key, value] of Object.entries(it?.categoriesObject ?? {}).slice(0, 10)) { %>
  <a class="category-chip" href="/category/<%= encodeURIComponent(key.replace(/ /g, '+')) %>"
    title="Browse <%= key %>">
    <%= key %> <span class="count"><%= value %></span>
  </a>
  <% } %>
</div>
```
(Check how the existing category-card computes its href in `category-card.eta` and copy that URL-building exactly — do not invent a different scheme.)

**SCSS:** horizontal wrap of chips; `.count` muted small number.

**Verify:** rail shows the top 10 categories with counts, links to `/category/...` work.

---

### 4.3 First-time explainer strip (optional, small)

Add a dismissible one-liner under the hero for new visitors:
```eta
<div class="home-note">
  <p><strong>New to Godot assets?</strong> Everything here is free and open source. Open an asset to see previews, then hit <em>Download</em> — or install it right inside the Godot editor via the AssetLib tab.</p>
</div>
```
Styled as a muted info card. Skip if the promo bar is already used for announcements (the layout shows a promobar from `GetPromobarMessage`); keep it only if it does not collide.

---

## Phase 5 — Cross-cutting polish

### 5.1 Toast-style page messages

**Files:**
- `src/app/components/partials/page-message/styles.scss`
- `src/static/javascript/utilities.js` (`pageMessages`)

**SCSS** — replace the sticky inline box with a toast stack:
```scss
.page-message {
  .messages {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: $z-toast;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 360px;
  }

  .message {
    padding: 12px 16px;
    border-radius: $border-radius-md;
    background: $text-dark-darkest;
    color: $text-on-inverse;
    box-shadow: $shadow-lg;
    font-family: "Inter", sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 10px;

    &.error { background: $color-danger; }
    &.success { background: $color-success; }
  }

  .message-close {
    margin-left: auto;
    background: none;
    border: none;
    color: inherit;
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
  }
}
```
Remove the old `position: sticky; top: 95px;` rule.

**JS** — extend `pageMessages.addPageMessage` to add a close button and auto-dismiss:
```js
addPageMessage: function (message, kind) {
  const pageMessageContainer = document.querySelector('.page-message .messages')
  const messageNode = document.createElement('div')
  messageNode.innerText = message
  messageNode.classList.add('message')
  if (kind === 'error' || kind === 'success') messageNode.classList.add(kind)
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'message-close'
  close.setAttribute('aria-label', 'Dismiss message')
  close.textContent = '×'
  close.addEventListener('click', function () { messageNode.remove() })
  messageNode.appendChild(close)
  pageMessageContainer.appendChild(messageNode)
  window.setTimeout(function () { messageNode.remove() }, 5000)
}
```
Keep `removeAllPageMessages` as-is. Existing call sites keep working (they pass one string). The "Success!" + reload flow in `sendFormAjax` still works (reload beats the 5s timer).

**Edge case:** several rapid messages stack; each dismisses independently. `role="status" aria-live="polite"` on the container is unchanged, so screen readers still announce.

**Verify:** save/unsave, review submit, login errors all appear as bottom-right toasts that auto-dismiss; close button works.

---

### 5.2 Focus + live-region for pagination

**Files:**
- `src/app/code/search/views/templates/search.eta`
- `src/static/javascript/utilities.js`

**Template:** wrap the results section in a focusable, live region:
```eta
<section class="results-region" id="results-region" tabindex="-1" aria-live="polite">
  ...catalog-grid...
</section>
```

**JS:** when a pagination link is clicked, focus the region so keyboard/screen-reader users land on results:
```js
document.addEventListener('click', function (event) {
  const link = event.target instanceof Element ? event.target.closest('.page-number, .pagination-btn') : null
  if (link === null || link.getAttribute('href') === null) return
  const region = document.getElementById('results-region')
  if (region !== null) region.focus({ preventScroll: true })
})
```
(Focus happens before navigation; on the new page add a small script that focuses the region after load if the URL contains `page=` and a fragment anchor is absent. Simplest reliable: on DOMContentLoaded, if `location.search` includes `page=` and `location.hash === ''`, focus `#results-region`.)

**Verify:** keyboard tabbing to Next and Enter lands focus on the results region after navigation; screen reader announces the new results.

---

### 5.3 Empty-state polish

**Files:** `src/app/code/search/views/templates/search.eta`, `src/app/code/search/views/styles/styles.scss`

The no-results block already has recovery links. Improve it:
- Add a muted heading: `<h2>No assets found</h2>` before the paragraph.
- Add an icon (iconify, e.g. `bx:search-alt`) with `aria-hidden="true"`.
- Keep the existing action links.

**SCSS:** center the block, add `padding: $space-8`, muted color, icon size 40px.

**Verify:** a nonsense query shows a friendly empty state with working recovery links.

---

## Phase 6 — Stretch ideas (only if time permits; each is independent)

- **6.1 "Godot 4 vs 3" quick toggle on search** — a prominent segmented control that maps to the existing `engine` filter (3.x / 4.x). Data is currently 3.x-only; implement the control only when facets contain 4.x values (guarded, safe to ship).
- **6.2 Card hover preview cycle** — on hover, cycle through `cardPreviews` images (CSS or tiny JS); graceful on touch (no hover → static first image).
- **6.3 Dark mode** — add `[data-theme]` on `<html>`, token overrides in `variables.scss` behind a `@media (prefers-color-scheme: dark)` block; opt-in first.
- **6.4 "Similar assets" inline in search** — reuse `GetRelatedAssets` for a "You may also like" row at the bottom of a single-result query.
- **6.5 Grid density switch** — 4/6 columns toggle persisted in localStorage (like the existing `limit` select but visual only).

---

## Testing plan (add to `tests/`)

New/changed pure functions to unit test (follow the pattern in `tests/search.test.ts` — `node:test` + `assert/strict`, import from `src/...`, compiled by `npm run test:build`):

1. **`tests/card-previews.test.ts`** — test `getCardPreviews`:
   - returns up to `max` items;
   - drops `external` items (non-http URLs, unknown extensions);
   - keeps image and video entries, mapping to `{ url, type }` where `url` is the thumbnail when present else the link;
   - returns `[]` for missing/empty previews.

2. **`tests/card-view.test.ts`** — test `attachCardExtras`:
   - sets `cardPreviews` on each asset;
   - blanks non-http(s) `download_url` (e.g. `javascript:alert(1)`, `ftp://...`, `''`) and keeps `https://...`.

3. **`tests/search-url.test.ts`** — regression: `buildSearchUrl` omits default `page=0`, keeps `page=N` (already covered; extend with `limit` non-default).

No new Mongo-query tests (existing suite mocks nothing DB-wise — keep new tests to pure helpers, consistent with the current suite).

## Manual verification checklist (run against the Docker stack on :8080)

- Homepage: one H1; hero + category rail + 4 sections with preview thumbnails; cards show ≤3 lines of description.
- Search: filters collapse/expand (persisted); chips bar above results; instant-apply checkboxes; Load more appends; `/` focuses search; recent searches appear; no-results empty state improved.
- Asset page: sticky action bar; meta callout; copy buttons (asset name, install instructions); video play badges; reviews anchor; Download opens ZIP; Save toggles without reload.
- Install modal: type-aware instructions + copy buttons + Free/compat line.
- Account pages: toasts replace inline messages; saved/reviews cards show previews and Download.
- Responsive: mobile filter toggle, single-column grid, asset action bar wraps.
- a11y: single H1 on homepage; skip-link; aria-expanded on all disclosures; focus lands on results after pagination; toasts announced.
- Performance: card grids unchanged in query count (previews come from the existing projection); `load-more` adds one request per click.

## Suggested implementation order

1. Phase 1 (1.1 → 1.2 → 1.3 → 1.4) — highest value, touches the shared card.
2. Phase 2 (2.1 → 2.2 → 2.3 → 2.4 → 2.5) — asset page.
3. Phase 3 (3.1 → 3.2 → 3.3 → 3.7 quick wins; then 3.4 load-more; then 3.5/3.6).
4. Phase 4 (4.1 → 4.2 → 4.3).
5. Phase 5 (5.1 toasts → 5.2 focus → 5.3 empty state).
6. Tests as you go (each pure helper gets a test in the same PR/commit).

Run `npm run typecheck && npm run lint:check && npm test && npm run build` after each phase.
