# Godot Asset Library

![](example.png)

**What is this:**
An Open Source (AGPLv3) Godot Asset Library

Features:
* Asset mirroring from the default library
* Asset review and rating system
* User accounts with bookmarking
* Open Source 😎
  
## Running
### Docker based envrionment
Run:
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

### Non docker based development:
```
npm run devel
```

For linting:
```
npm run lint:check
```

### Verification
```
npm run typecheck      # TypeScript validation (use this, not `build`, for types)
npm run lint:check     # ESLint enforcement (npm run lint exits 0 by design)
npm test               # Compiles and runs the node:test suite (host Node 18+)
npm run build          # Webpack bundle + per-page Sass
```

### Indexes & migrations
Search relies on MongoDB text search and several derived fields. Migrations
are applied with a single command (they record completion in the `migrations`
collection, so they are idempotent):
```
npm run migrate
```
Migrations create/verify:
* `0001` — the weighted text index (`title` 10, `quick_description` 7, `author` 7, `description` 1). MongoDB only allows one text index per collection, so a conflicting legacy index must be dropped manually first.
* `0002` — backfills the confidence-adjusted `rating_score` (95% Wilson lower bound) used by "Highest rated" sorting.
* `0003` — backfills the normalized `modify_date_at` used by "Recently updated" sorting.
* `0004` — deduplicates reviews by `(user_id, asset_id)` and creates the unique index.
* `0005` — backfills the numeric `godot_major` used by major-line browsing filters.
* `0006` — backfills the denormalized `is_public` flag used by the public-catalog filter (the importer keeps it current afterwards).

Operational maintenance (run against a snapshot first):
```
npm run reconcile:ratings   # Recompute vote counters + rating_score from reviews
npm run audit:catalog       # Read-only catalog health audit
npm run audit:queries       # explain("executionStats") baseline for the hot query shapes (capture before/after index changes)
```

Load / failure testing (against a running instance):
```
npm run loadtest -- --url http://localhost:8080 --paths '/,/search/' --concurrency 50 --duration 15
# Warm hits, cold unique paths, and random-abuse-URL profiles all use the same harness.
```

### Monitoring & runbook
`GET /metrics` (bearer-protected via `METRICS_TOKEN`) exposes Prometheus text.
Per-process metrics are available immediately; a cluster-wide block
(`http_cluster_*`) is aggregated by the primary over IPC and appears on every
worker within a few seconds (`TELEMETRY_AGGREGATE_INTERVAL_MS`, default 10s).
Route-class metrics (`http_requests_{homepage,browse,search,asset,...}_total`)
let you tell crawler-vs-bot-vs-user load apart without high-cardinality labels.

Suggested alert thresholds (per worker unless noted):
- `http_request_duration_p99_ms` > 2000ms sustained — origin slowing under load.
- `http_event_loop_lag_max_ms` climbing (or > 500ms) — CPU-bound blocking.
- `mongo_wait_queue_timeouts_total` / `mongo_server_selection_errors_total` rising — MongoDB saturated; expected when uncached overload is allowed to run into fail-fast timeouts.
- `http_5xx_total` rate rising — upstream errors; check Mongo + cache error counters.
- `cache_stale_hits_total` rising — public snapshots being served stale; expected and healthy during origin/dependency trouble, worth watching if sustained.
- `http_static_requests_total` vs `http_requests_total` — the static/dynamic split; a large static share means the edge/CDN is absorbing traffic.

Failure drills to run before relying on edge caching:
1. Stop Dragonfly while serving warm traffic → expect stale/L1 serving, no Mongo stampede.
2. Stop MongoDB while stale snapshots exist → expect stale public pages, no cached 4xx/5xx.
3. Restart one worker during load → auto-heal + graceful drain, no dropped requests.
4. Deploy while requests are active → readiness drops, connections drain, no 503s.
5. Confirm authenticated/mutation traffic never receives cached anonymous HTML.

## Folder Structure
```
 src
  └───backend             # Backend / dynamic 
    │   RouterServer.ts   # Start our router
    │   MongoHelper.ts    # Our MongoDB helper
    │   start.ts          # App entry point
    └───components        # Reusuable eta.js templates
    └───modules           # Each site module (ex, admin area, blog area, etc) 
      └─── ModuleName     # Module Example
        │───controllers   # Module controllers
        │───jobs          # Cron / scheduled jobs
        │───models        # Database models
        │───services      # All the business logic
        │───views         # Store the Views for the module (eta.js templates)
    └───utility           # All our utility classes, like loggers
  └───frontend            # Frontend assets (ex pre-compiled or static)

```

**Controllers**
Controllers do not handle business logic. They interpret routes, call our services and return the data

**Services**
Services handle all our buisness logic

**Models**
Our DB models

**Jobs**
Spot to put cron jobs or other scheduled jobs

**Views**
Our ETA templates and relevant SCSS for the page

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
