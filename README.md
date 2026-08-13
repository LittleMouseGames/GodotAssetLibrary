# Godot Asset Library

An open source (AGPLv3) catalog of Godot assets — mirrored from the legacy Godot
Asset Library and the official Godot Asset Store into one searchable site.

## Features

* Mirrors assets from both the legacy Asset Library and the Godot Asset Store
* Search with category, engine-version, type and source filters
* Asset pages with media, compatibility, license, price and install help
* Reviews & ratings, user accounts and bookmarks
* Light/dark themes and a Godot version pin
* Open source 😎

## Running

### Docker

```
docker compose up -d --build
```

For local development with source watching:

```
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

To tail nodejs:

```
docker logs nodejs -f
```

### Without Docker

```
npm run devel
```

### Verification
```
npm run typecheck      # TypeScript validation (use this, not `build`, for types)
npm run lint:check     # ESLint enforcement (npm run lint exits 0 by design)
npm test               # Compiles and runs the node:test suite (host Node 18+)
npm run build          # Webpack bundle + per-page Sass
```

### Godot Asset Store integration

The catalog mirrors the official Godot Asset Store (`store.godotengine.org`)
through its public API as a second source alongside the legacy Asset Library:

* Assets are ingested daily (and on demand with `npm run import:store`), keyed
  by source so one source can never hide the other's records.
* Projects listed in both sources are grouped into a single card — the Store
  variant is shown by default, with a source switcher on the asset page.
* Search has a **Source** filter (All / Godot Asset Store / Legacy Asset Library)
  and cards show which source an asset came from.
* Store assets link out to the official Store page for downloads; packages and
  expiring download URLs are never mirrored.
* Cards show the Store's own score (marked `*`) when there are no local ratings.
* `/admin/sources` reviews and links Store records to their legacy counterparts.

## Style guide
All functions will have a `DocBlock` to describe its purpose
```js
/**
* Short function description
*/
function name () {
  ...
}
```

All functions will be static typed
```js
/**
* Print name and age to console
*/
function name (name: string, age: number): void {
  console.log(name, age)
}
```

All functions will have full docblocks ( for API generation and editor hints )
```js
/**
* Print name and age to console
* 
* @param {string} name the users name
* @param {number} age the users age
* @returns {void}
*/
function name (name: string, age: number): void {
  console.log(name, age)
}
```

Filenames to match class names
```js
// GetCoffee.ts
export class GetCoffee {
  ...
}
```

## Code guide
* Models can (and should!) throw errors
* Following TS Standard (as best as resonably possible)
