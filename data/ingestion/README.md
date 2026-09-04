# NYC Events Map

An interactive map of NYC events. A data pipeline collects and geocodes events from multiple sources, funnels them into Supabase (Postgres + PostGIS), and serves them to a Mapbox GL JS frontend. The same Supabase project is the planned backend for [`offmap`](offmap/), a future Expo mobile app — see `offmap/docs/plan.md`.

---

## How it works

```
Scrapers / CSV intake
        ↓
   Supabase (Postgres + PostGIS)  ←→  Mapbox Geocoding API
        ↓
   Express API  (/api/events → GeoJSON)
        ↓
   Mapbox GL JS map  (public/index.html)
```

1. **Collect** — run `npm run scrape` to pull events from web sources, or `npm run intake` to load a CSV manually.
2. **Geocode** — scrapers that supply coordinates (BBG) skip this step. Others are geocoded via Mapbox after each scrape.
3. **Review** — events from low-confidence sources land in `needs_review` status and don't appear on the map until approved via `POST /api/events/:id/status`.
4. **Serve** — `npm run serve` starts the Express server and map at `http://localhost:3000`.

The backend talks to Supabase over its HTTPS Data API (`@supabase/supabase-js`), not a raw Postgres connection — Supabase's direct-connection host is IPv6-only, which made it unreachable from some networks. Anything beyond a plain insert/update/select (COALESCE-based venue enrichment, PostGIS point construction, the set-based `can_display`/duplicate-group recompute) is implemented as a Postgres function in `offmap/supabase/migrations/` and called via `.rpc(...)`, restricted to `service_role` so the public anon key can't invoke them.

---

## Setup

1. Create a Supabase project, then in its **SQL Editor** run, in order:
   - `offmap/supabase/migrations/20260621000000_init_schema.sql` — tables, indexes, RLS, `nearby_events`
   - `offmap/supabase/migrations/20260621000001_funnel_functions.sql` — the RPCs the backend writes through
   - every other file in `offmap/supabase/migrations/`, in filename (date) order — includes `20260828000000_add_event_sources.sql`, required before `npm run onboard-source` or `npm run scrape:genericurl` will work
2. Copy `.env` and fill in your tokens (see [Environment variables](#environment-variables)), including `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API.
3. `npm install`
4. (Optional) `npm run migrate-sqlite` — one-time backfill if you have an existing `data/events.db` from before this moved to Supabase.
5. `npm run scrape` — populates the database.
6. `npm run serve` — opens the map.

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run migrate-sqlite` | One-time backfill of a legacy `data/events.db` into Supabase, through the same upsert/insert RPCs the scrapers use |
| `npm run intake <file.csv>` | Loads a CSV file of events into the database |
| `npm run geocode-pending` | Geocodes any venues that are missing coordinates |
| `npm run scrape` | Runs all scrapers (including Instagram and genericurl), then geocodes new venues |
| `npm run scrape:instagram` | Runs only the Instagram scraper, skipping geocoding and global recomputes — faster for testing |
| `npm run scrape:genericurl` | Runs only the generic-URL source scraper, skipping geocoding — faster for testing |
| `npm run onboard-source <url>` | Checks a brand-new candidate URL once and, if it clears the quality bar, saves it into `event_sources` as `candidate` for later review/promotion — see [Generic-URL event sources](#generic-url-event-sources) |
| `npm run serve` | Starts the web server at `http://localhost:3000` |

Pass `--skip-geocode` to any scrape command to skip the Mapbox geocoding and recompute passes: `node scripts/scrape.js luma --skip-geocode`.

---

## Environment variables (`.env`)

| Variable | Required | Description |
|---|---|---|
| `MAPBOX_TOKEN` | Yes | Public token from mapbox.com — used for the map and geocoding API |
| `SUPABASE_URL` | Yes | Project URL, e.g. `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | From Project Settings → API. Bypasses RLS — server-side only (runner.js/server.js/geocoding/intake), never shipped to a client bundle |
| `SUPABASE_ANON_KEY` | No | Publishable key — only needed if a script reads through RLS as a public client would |
| `DB_PATH` | No | Path to a legacy SQLite file, only used by `npm run migrate-sqlite` (default: `./data/events.db`) |
| `REDDIT_CLIENT_ID` | No | Enables Reddit scraper — create a free "script" app at reddit.com/prefs/apps |
| `REDDIT_CLIENT_SECRET` | No | Paired with `REDDIT_CLIENT_ID` |
| `EVENTBRITE_TOKEN` | No | Reserved for future use — Eventbrite's search API is currently deprecated; the scraper uses HTML scraping instead (no token required) |
| `APIFY_TOKEN` | No | Apify token (apify.com → Settings → Integrations) — runs the `apify/instagram-post-scraper` actor to fetch posts, enables `instagram.js` |
| `GROQ_API_KEY` | No | Groq API key (free tier, no card required) — used by the Instagram scraper for event parsing from captions. Get one at console.groq.com → API Keys |
| `GEMINI_API_KEY` | No | Google Gemini API key (free tier) — used by the generic-URL scraper's text extraction fallback tiers. Get one at aistudio.google.com |
| `PORT` | No | Server port (default: `3000`) |

**Mapbox free tier:** geocoding is billed per venue address, not per scrape run. Each address is geocoded once and stored permanently. The map itself counts one load per user session.

**Groq free tier:** 30 requests/min, 14,400 requests/day on `llama-3.3-70b-versatile` — one call per Instagram post, comfortably covers 30+ accounts at ~10 posts/account.

**Gemini free tier:** 1,500 requests/day on `gemini-flash-latest` — used only by the generic-URL scraper's LLM fallback tiers.

---

## Database (Supabase)

Schema lives in `offmap/supabase/migrations/`, not in this app — it's shared with the future `offmap` mobile app. Highlights vs. the old SQLite schema:

- `venues.location` is a `geography(point, 4326)` (PostGIS) instead of bare `latitude`/`longitude` columns. `latitude`/`longitude` still exist as generated columns (`ST_Y`/`ST_X`) so existing query code didn't need to change.
- `events.tags` is a native `text[]` instead of JSON-encoded text.
- `events.search_text` (computed in JS, same as before) backs a generated `tsvector` column (`search_vector`, GIN-indexed) for real full-text search.
- `scrape_runs` logs one row per scraper per `npm run scrape` invocation (`source_name`, counts, errors) — funnel observability that didn't exist in the SQLite version.
- `saved_events`/`profiles` and a `nearby_events(lat, lng, radius_meters)` RPC exist for the future mobile app (per `offmap/docs/plan.md`), not used by this Express app.
- RLS: public (anon) reads are limited to `venues` and to `events` where `can_display = true`. This Express backend uses `service_role`, which bypasses RLS entirely.

---

## File reference

### `db/`

| File | Purpose |
|---|---|
| `supabase.js` | `getDb()` returns a singleton `@supabase/supabase-js` client authenticated with `SUPABASE_SERVICE_ROLE_KEY` — server-side only |
| `funnel.js` | Shared upsert logic used by both `runner.js` and `csv-intake.js`: `classifyRow` (runs `classify()` once per row so callers can pass the same result into both of the below instead of classifying twice), `upsertVenue`/`insertEvent` (call the `upsert_venue`/`insert_event` RPCs — see [Database](#database-supabase)), `recomputeCanDisplay`/`recomputeDuplicateGroups`/`recomputeCompletenessScores`/`recomputeVenueCompletenessScores`/`mergeDuplicateVenues`/`purgePastEvents` (call their respective RPCs) |
| `eventSources.js` | CRUD + health-tracking for `event_sources`, used exclusively by `scrapers/genericurl/` and `pipelines/onboard-source.js` — not part of the shared venue/event upsert path. Plain `.from('event_sources')` calls for reads/writes; `recomputeSourceHealth()` calls the `recompute_source_health` RPC. |

### `intake/`

| File | Purpose |
|---|---|
| `csv-intake.js` | Parses a CSV file, validates required fields, then runs each row through the same `upsertVenue`/`insertEvent` as the scrapers (address splitting, `normalized_title`/`search_text`, etc.). Duplicate `source_url` values are silently skipped. |

### `geocoding/`

| File | Purpose |
|---|---|
| `mapbox.js` | Geocodes venues via the Mapbox Geocoding API. Uses `venue name + address` when the address is generic ("New York, NY"). Skips placeholder "New York City" venues. Caches results per geocode query within a run so venues sharing an address (e.g. several spaces in the same building) only cost one Mapbox call. Stores results permanently (via the `set_venue_geocode` RPC, which builds the PostGIS point) so each address is only ever billed once. Also exports `backfillNeighborhoods()` — a reverse-geocode pass that fills in `neighborhood` for venues that already have coordinates from their own scraper (and therefore never went through forward geocoding) — this one's a plain column update, no RPC needed. |

### `api/`

| File | Purpose |
|---|---|
| `server.js` | Express server. Serves `public/index.html` with the Mapbox token injected. Three endpoints: `GET /api/events` (GeoJSON, filtered to NYC bounds, includes `source_name` for panel attribution), `GET /api/categories` (5-minute in-memory cache), `POST /api/events/:id/status` (approve/reject; fires `recompute_can_display` in the background instead of making the caller wait on a full-table pass). |

### `scrapers/`

| File | Purpose |
|---|---|
| `utils.js` | Shared helpers — date/time extraction from free text, price/free detection, text normalization (`normalizeText`, `buildSearchText`), `extractAgeRestriction`, `splitUSAddress` (handles commas, semicolons, trailing "USA"/"United States", and city+state+zip merged into one segment), `buildWeeklyRRule` |
| `runner.js` | Orchestrates all scrapers: logs a `scrape_runs` row per source, inserts rows into Supabase, purges past events, geocodes new venues, then recomputes venue completeness scores, merges duplicate venues, and recomputes `can_display` (from current venue/review state), duplicate groups (exact-match on `normalized_title` + calendar date), and completeness scores via RPC. There's no more `backfillDerivedFields` pass — every insert now goes through `upsertVenue`/`insertEvent`, which always compute these fields, so there are no legacy NULL gaps to backfill on a fresh Postgres table. A scraper that exports `venueOnly = true` + `fetchVenues()` (currently `museums.js` and `local-spots.js`) is routed through `upsertVenue()` alone, skipping `insertEvent()` entirely — for sources that supply permanent venues with no time-bound event to attach. |
| `bbg.js` | Brooklyn Botanic Garden events calendar. Static HTML (`li.dontmiss-event`), no key needed. `candidate` status. Supplies `external_id` (URL slug), `organizer_name` (= venue, BBG runs its own events), `recurrence_rule` for "Wednesdays & Fridays"-style listings. |
| `moma.js` | MoMA calendar. Tries JSON-LD then HTML. Currently Cloudflare-blocked; returns 0 with a warning. |
| `reddit.js` | `r/nycevents` via Reddit OAuth. Regex-extracts dates/venues/age restrictions from post titles. Requires `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`. `needs_review`. Supplies `external_id` (Reddit post id). |
| `timeout.js` | TimeOut NYC "things to do this week" article. Tiles parsed with approximate current-week dates. `needs_review`. Supplies `external_id` (article slug). |
| `theskint.js` | The Skint RSS feed (`theskint.com/rss`). Each item = one NYC event digest post. `needs_review`. Supplies `external_id` (post slug), best-effort `age_restriction`. |
| `untappedcities.js` | Untapped Cities tag page (Ghost CMS). Article cards with publish dates. `needs_review`. Supplies `external_id` (article slug). |
| `luma.js` | Luma NYC (`luma.com/nyc`). Reads `__NEXT_DATA__` — events with lat/lng, `city`/`region`/`country` from `geo_address_info`, and `external_id` (`api_id`/slug) included. `candidate`. |
| `partiful.js` | Partiful NYC explore page. Parses event cards via Sentry data attributes. Dates are next-occurrence of stated weekday. `needs_review`. Supplies `external_id` (event slug). |
| `eventbrite.js` | Scrapes Eventbrite's NYC discover pages (6 category pages × ~40 events = up to 240/run). No key needed — reads JSON-LD from `window.__SERVER_DATA__`. Full address parts (`street`/`city`/`region`/`zip`) and `external_id` (numeric event id from URL) included. `candidate`. `price_text`/`organizer_name` are genuinely absent from Eventbrite's JSON-LD — not a bug. |
| `dice.js` | **Stub** — Dice.fm `/browse` geo-locks to user's IP city; no stable NYC URL found. See file for notes. |
| `thrillist.js` | **Stub** — Thrillist NYC URL structure changed (old paths 404). See file for notes. |
| `donyc.js` | Do NYC (`donyc.com/events`). Full Schema.org microformat with embedded lat/lng, address parts, and `external_id` (URL date+slug). `candidate`. |
| `nycparks.js` | NYC Parks events calendar (`nycgovparks.org/events`). Static HTML with Schema.org Event microdata, paginated up to 20 pages. `candidate`. Overlaps with `nycopendata.js` (same city agency, different feed) — relies on `recompute_duplicate_groups()` + the API's duplicate-group filtering to avoid showing the same event twice. |
| `residentadvisor.js` | Resident Advisor GraphQL API (area ID 8 = NYC). ~250 events/run with venue lat/lng, artist tags, `external_id` (RA event id), `age_restriction` (their `minimumAge` field — RA's electronic shows are almost always 21+), and `organizer_name` (first promoter). `candidate`. |
| `nycopendata.js` | NYC Open Data Socrata API (dataset tvpp-9vvx). Filters to public-interest event types: Special Events, Farmers Markets, Block Parties, Parades, etc. Excludes sports permits. `candidate`. Supplies `external_id` (`event_id`) and `organizer_name` (the issuing city agency). |
| `brooklynmuseum.js` | **Stub** — Vercel-blocked; needs API key from brooklynmuseum.org/opencollection/api. See file for notes. |
| `met.js` | **Stub** — Vercel-blocked; no events-specific API. See file for notes. |
| `museums.js` | NYC museums & art galleries as permanent **venues**, not events — OpenStreetMap Overpass API (`tourism=museum`/`tourism=gallery` within the NYC bbox), no key needed. Exports `fetchVenues()` + `venueOnly = true` instead of `fetchEvents()`; `runner.js` routes these through `upsertVenue()` only (never `insertEvent()`). Supplies coordinates directly (skips Mapbox forward geocoding) and the raw OSM `opening_hours` string into `venue_opening_hours`. Writes OSM's `addr:suburb`/`is_in:neighbourhood` into `neighborhood` directly when present; venues OSM didn't tag with one fall through to the regular `backfillNeighborhoods()` reverse-geocode pass. Source name logged as `osm_museums`. |
| `instagram.js` | **Paused** — built and functional (Apify fetches posts, `parseEvents` extracts structured events via Groq's free tier) but not currently registered in `pipelines/runner.js`'s `SCRAPERS` array, so it doesn't run under `npm run scrape` or `npm run scrape:instagram`. Instagram public accounts listed in `config/instagram_accounts.json`. Calls `fetchApifyPosts` (runs the `apify/instagram-post-scraper` Apify actor) to fetch new posts, then `parseEvents` (Groq structured extraction on the post caption, one post can yield several events e.g. a roundup) per post. Requires `APIFY_TOKEN` and `GROQ_API_KEY`. All events would land with `needs_review` status — nothing displays until approved. Source name: `instagram/@username`. To resume: add `GROQ_API_KEY` to `.env`, re-add `instagram` to the `SCRAPERS` array in `pipelines/runner.js`. |
| `genericurl/` | Arbitrary venue-website URLs registered in the `event_sources` table (see [Generic-URL event sources](#generic-url-event-sources) below) — not a fixed feed like every other scraper here. Detects whether a page publishes events and extracts them at the cheapest tier that works: schema.org JSON-LD/microdata, a platform adapter (Luma/Eventbrite/Partiful/Webflow), a generic embedded-JSON-state scan, then (only on a concrete validation failure) a small Gemini call on trimmed page text, escalating to a larger-context Gemini call as a last resort. Headless rendering is deliberately not implemented yet — see the module's own comments. Run alone with `npm run scrape:genericurl`. |

### `scrapers/instagram/`

**Paused along with `instagram.js` above** — not part of the active pipeline. The extraction layer used exclusively by `instagram.js`. Requires a Groq API key (free tier) and an Apify token.

| File | Purpose |
|---|---|
| `fetchApify.js` | Runs the `apify/instagram-post-scraper` actor (via `apify-client`) for every account in `config/instagram_accounts.json` and returns posts normalized to `{ shortcode, username, caption, timestamp, media_type, media_urls, post_url }`. Media URLs are read directly from the Apify response (CDN links, used for display) — nothing is downloaded to disk. |
| `parseEvent.js` | Sends caption text to Groq (`llama-3.3-70b-versatile`) with a structured prompt and JSON schema (strict structured outputs). Resolves relative dates against the post's timestamp, filters categories to the controlled vocab, and returns an array of structured event objects (empty if the post describes no upcoming events — a post can also describe several, e.g. a roundup). Exports `parseEvents`. |

### `scrapers/genericurl/`

The detect/extract pipeline used exclusively by `genericurl.js` (technically `genericurl/index.js`) against sources in the `event_sources` table.

| File | Purpose |
|---|---|
| `index.js` | The scraper entry point (`name`/`envKey`/`fetchEvents()`). Reads `active`/`quiet` sources, runs `pipeline.processSource()` per one with a shared per-run LLM call budget (`GENERICURL_MAX_LLM_CALLS_PER_RUN`, default 100), records health via `db/eventSources.js`, then calls `recompute_source_health()` once. |
| `pipeline.js` | Orchestrates one source: cache/diff short-circuit → `detectSignals.js` → deterministic/adapter extraction → render-escalation check → LLM tiers (budget permitting) → `validate.js`. Every exit path returns a `status` + reason code; nothing is ever fabricated. |
| `fetchRaw.js` | Plain HTTP `fetchHtml()`/`fetchJson()` — the cheapest stage, tried first everywhere. |
| `detectSignals.js` | The ordered, short-circuiting detection chain: JSON-LD → known-platform match → generic embedded-state (`__NEXT_DATA__`/`__NUXT__`/etc.) → keyword+date-density heuristic → no signal. |
| `renderDecision.js` | Decides whether a plain-fetch result shows a genuine empty-shell SPA signature. `renderHeadless()` currently throws (`render_unsupported`) — Playwright is deliberately not added yet, see the file's own comments. |
| `validate.js` | Confidence scoring + required-field/date-plausibility checks, applied identically to every extraction tier. The single "stop or escalate" gate. |
| `contentHash.js` | Hashing helpers for the cache/diff gate — stripped text, shadow-API JSON body, or a bundle-fingerprint proxy. |
| `adapters/luma.js`, `eventbrite.js`, `partiful.js`, `webflow.js` | Platform adapters, highest confidence/lowest marginal cost when they match. Luma's calendar-page path calls Luma's own public `api.lu.ma/calendar/get-items` shadow API rather than needing headless rendering. |
| `extract/deterministic.js` | Tier-1 JSON-LD/microdata scan, adapter-agnostic. |
| `extract/trimText.js` | HTML → trimmed visible text for the LLM tiers, prioritizing text around date-like substrings over a naive head-of-document cutoff. |
| `extract/llmSmall.js` | Tier 2 — `gemini-flash-lite-latest` on a ~6K-char snippet. |
| `extract/llmLarge.js` | Tier 3, last resort — `gemini-flash-latest` on a ~20K-char snippet. Same vendor/family as tier 2, just more context. |

### `config/`

| File | Purpose |
|---|---|
| `instagram_accounts.json` | List of Instagram usernames to scrape. Edit this file to add or remove accounts — no code changes needed. |

### `pipelines/`

| File | Purpose |
|---|---|
| `migrate-sqlite-to-supabase.js` | CLI entry point for `npm run migrate-sqlite` — one-time backfill, not part of the regular pipeline |
| `intake.js` | CLI entry point for `npm run intake <file.csv>` |
| `geocode-pending.js` | CLI entry point for `npm run geocode-pending` |
| `backfill-categories.js` | CLI entry point for `npm run backfill-categories` |
| `scrape.js` | CLI entry point for `npm run scrape`. Pass scraper names to run a subset (e.g. `node pipelines/scrape.js luma instagram`). Pass `--skip-geocode` to skip the Mapbox geocoding and recompute passes. |
| `onboard-source.js` | CLI entry point for `npm run onboard-source <url>` — checks a brand-new URL once and saves it into `event_sources` (as `candidate`) if it clears a quality bar. See [Generic-URL event sources](#generic-url-event-sources). |
| `serve.js` | CLI entry point for `npm run serve` |

### `public/`

| File | Purpose |
|---|---|
| `index.html` | Single-page Mapbox GL JS map. Centered on NYC. Clusters events at low zoom. Filter bar: category, date range, free-only. The Mapbox token is injected by the server at request time. Clicking a pin opens a slide-in event detail panel (see below) instead of the native Mapbox popup; hovering shows a lightweight title-only tooltip. |

**Event detail panel** — opens on marker click, slides in from the right (desktop) or up as a bottom sheet (mobile, ≤600px):
- **Hero image** with category-colored gradient placeholder when no `image_url` exists (no broken-image states)
- **Price badge** — Free / `$15–$30` / `From $20` / Price Unknown, parsed from `price_text` + `is_free`
- **Location row** (collapsed: neighborhood/venue name) → expands to show full address, Google Maps / Apple Maps links, and a Copy Address button with toast confirmation
- **Time row** (collapsed: short date + status badge — Upcoming / Happening Now / Ended) → expands to full date range with timezone
- **Description** — HTML-stripped, truncated to ~150 chars with "Show more"
- **Ratings section** — implemented but hidden; no scraper currently populates `rating`/`review_count` (see Data model notes below)
- Closes via ✕ button, Escape key, or backdrop click (mobile only)
- `window.map` is exposed globally for console debugging

### `data/`

| File | Purpose |
|---|---|
| `sample-events.csv` | 10 sample NYC events used for testing the pipeline end-to-end |
| `events.db` | SQLite database (git-ignored) |
| `instagram_state.json` | Auto-created on first successful Instagram scrape. Stores the most recent post shortcode and run timestamp per account so subsequent runs only fetch new posts. Git-ignored. |

---

## Review workflow

Events arrive with one of these statuses:

| Status | Meaning | Shows on map? |
|---|---|---|
| `candidate` | High-confidence source (BBG, manual CSV) | Yes (in dev mode) |
| `needs_review` | Low-confidence source (Reddit, TimeOut) | No — requires approval |
| `approved` | Manually approved | Yes (production) |
| `rejected` | Discarded | No |

Approve or reject an event:
```
POST /api/events/42/status   { "status": "approved" }
```

---

## Generic-URL event sources

Every other scraper in this pipeline targets one fixed, hand-written feed. `scrapers/genericurl/` is different: it's a registry of arbitrary venue-website URLs (a small gallery's Webflow site, an individual host's Luma calendar, an Eventbrite organizer page) tracked in the `event_sources` table, checked automatically as part of `npm run scrape`, and monitored for staleness/breakage over time.

**Onboarding a new URL:**
```
npm run onboard-source https://example.com/events
```
Runs the same detect → extract → validate pipeline once, prints what it found, and — only if it finds at least one valid event at average confidence ≥0.6 — saves the URL into `event_sources` with `status = 'candidate'`. Nothing is added automatically to the recurring schedule; a candidate sits idle until a human reviews it.

**Promoting a candidate:** open `supabase/reviews/event_sources_review.sql` in the Supabase SQL Editor, check the `candidate` rows, and flip one to `status = 'active'` once you're satisfied with what it found. From then on `npm run scrape` (and `npm run scrape:genericurl`) checks it every run.

**Health states** (`event_sources.status`):

| Status | Meaning | Checked by the scraper? |
|---|---|---|
| `candidate` | Onboarded, awaiting manual promotion | No |
| `active` | Confirmed good, checked every run | Yes |
| `quiet` | No new/future event seen in 45+ days — automatic, reversible the moment it lists something new again | Yes |
| `broken` | 5 consecutive hard failures (blocked/not found/no signal/extraction failed) — automatic | No |
| `disabled` | Confirmed dead — manual only, via the review SQL file | No |

Automatic transitions only ever move a source toward `quiet`/`broken`, never toward `disabled` and never `candidate → active` — matching the manual-confirmation pattern this schema already uses for venue-duplicate merges. See `supabase/reviews/event_sources_review.sql` for the full manual workflow (checking what's pending, disabling a confirmed-dead source, resetting a `broken` source after a transient outage).

**Cost tiers, cheapest first:** schema.org JSON-LD/microdata → a platform adapter (Luma/Eventbrite/Partiful/Webflow) → a generic scan of framework-embedded JSON (`__NEXT_DATA__` and similar) → a small Gemini call (`gemini-flash-lite-latest`) on trimmed page text → a larger-context Gemini call (`gemini-flash-latest`) as a last resort. Each tier only runs when the previous one failed a concrete validation check (unparseable date, missing location, or a mismatch between rows found and date-like text visible on the page) — most JSON-LD/adapter-covered sites never reach an LLM call at all. Headless browser rendering (Playwright) is intentionally not implemented yet — see `scrapers/genericurl/renderDecision.js` for why and what happens when a source would need it (`render_unsupported`, recorded but not treated as the source's fault).

---

## Data model

`events` and `venues` carry a wide field set so multi-source data can be deduplicated, searched, and displayed consistently. Coverage varies by source because not every field exists in every source's raw data — see the per-scraper notes above for what each one actually supplies.

| Field | Populated by | Notes |
|---|---|---|
| `external_id` | Most scrapers | Source's own event id, extracted from the URL or API response. Reddit non-self-posts (linking out to a third-party site) can't supply this. |
| `duplicate_group_id` | `recompute_duplicate_groups()` SQL function | Exact match on `normalized_title` + calendar date across different sources. Recomputed from scratch every scrape run (single set-based `UPDATE`, no per-row JS loop) — group ids are stable (smallest event id in the group) but may be reassigned as new matches appear. Intentionally conservative: no fuzzy string matching, so it under-detects rather than over-merges distinct events. |
| `normalized_title` / `normalized_venue_name` | `runner.js`, centrally | Lowercased, punctuation-stripped. Computed automatically for every event/venue — scrapers never need to supply this. |
| `search_text` | `runner.js`, centrally | Concatenation of title + description + venue + tags + category, lowercased. |
| `recurrence_rule` | `bbg.js` only | RFC 5545 RRULE string, built when a scraper detects a recurring weekday pattern ("Wednesdays & Fridays"). No other source exposes recurring schedules in a parseable way. |
| `address_line` / `city` / `region` / `postal_code` / `country` | Most scrapers, via `splitUSAddress()` | Best-effort split of the free-text address. Returns `null` rather than guessing when the format is ambiguous (e.g. a bare street line with no city/state at all). |
| `age_restriction` | `residentadvisor.js` (real data, RA's `minimumAge`), others (regex best-effort on free text for "21+"/"18+"/"must be X") | |
| `ticket_url` | Every scraper (defaults to `source_url` in `runner.js` when not set) | No current source distinguishes a separate ticket-purchase link from its own event page. |
| `organizer_name` | `bbg.js` (= venue), `residentadvisor.js` (promoter), `nycopendata.js` (issuing city agency) | Other sources either don't expose an organizer or it would be the publisher rather than the organizer (e.g. Untapped Cities is a blog, not the event's organizer) — intentionally left `null` rather than populated with misleading data. |
| `image_source_url` | `runner.js`, centrally | Defaults to `source_url` whenever `image_url` is present — the event's own page is the practical "context" for the image on every current source. |
| `can_display` | `recomputeCanDisplay()` | Recomputed after every scrape (and after geocoding) from current state: venue has coordinates, event has a `start_time`, and `review_status` is `candidate` or `approved`. The `/api/events` endpoint filters on this directly. |
| `source_updated_at` | Not populated | No current source reliably exposes "last modified" separately from "when we fetched it." |
| `last_verified_at` | `runner.js`, centrally | Refreshed to the current scrape's timestamp every time a source_url is seen again, whether that's a fresh insert or a re-scraped duplicate — this is the freshness signal for "is this listing still live." |
| `notes` | Not auto-populated | Free-form field reserved for manual moderator annotations. |
| `venue_opening_hours` | `museums.js` | Raw OSM `opening_hours` string (e.g. `"Mo-Fr 10:00-17:00; Sa-Su 11:00-18:00"`), stored as-is — no other source provides structured hours. |
| `rating` / `review_count` | **Not in schema** | No current source provides ratings. The event detail panel's ratings UI is built and ready — add these columns plus a ratings source (Google Places, Yelp) to wire it up. |

Google Maps / Apple Maps links are generated client-side from `venue_address` at render time — no separate URL columns needed.
