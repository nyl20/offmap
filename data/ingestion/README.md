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
| `npm run scrape` | Runs all scrapers (including Instagram), then geocodes new venues |
| `npm run scrape:instagram` | Runs only the Instagram scraper, skipping geocoding and global recomputes — faster for testing |
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
| `INSTAGRAM_USERNAME` | No | Instagram username for the scraper's burner account — enables `instagram.js` |
| `INSTAGRAM_PASSWORD` | No | Password for the burner account — only used as a fallback if no saved session file exists |
| `GEMINI_API_KEY` | No | Google Gemini API key (free tier) — used by the Instagram scraper for image OCR and event parsing. Get one at aistudio.google.com |
| `PORT` | No | Server port (default: `3000`) |

**Mapbox free tier:** geocoding is billed per venue address, not per scrape run. Each address is geocoded once and stored permanently. The map itself counts one load per user session.

**Gemini free tier:** 1,500 requests/day on `gemini-2.0-flash` — sufficient for 30 accounts at ~5 posts/day with two AI calls per post.

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

### `src/db/`

| File | Purpose |
|---|---|
| `supabase.js` | `getDb()` returns a singleton `@supabase/supabase-js` client authenticated with `SUPABASE_SERVICE_ROLE_KEY` — server-side only |
| `funnel.js` | Shared upsert logic used by both `runner.js` and `csv-intake.js`: `upsertVenue`/`insertEvent` (call the `upsert_venue`/`insert_event` RPCs — see [Database](#database-supabase)), `recomputeCanDisplay`/`recomputeDuplicateGroups` (call their respective RPCs) |

### `src/intake/`

| File | Purpose |
|---|---|
| `csv-intake.js` | Parses a CSV file, validates required fields, then runs each row through the same `upsertVenue`/`insertEvent` as the scrapers (address splitting, `normalized_title`/`search_text`, etc.). Duplicate `source_url` values are silently skipped. |

### `src/geocoding/`

| File | Purpose |
|---|---|
| `mapbox.js` | Geocodes venues via the Mapbox Geocoding API. Uses `venue name + address` when the address is generic ("New York, NY"). Skips placeholder "New York City" venues. Stores results permanently (via the `set_venue_geocode` RPC, which builds the PostGIS point) so each address is only ever billed once. Also exports `backfillNeighborhoods()` — a reverse-geocode pass that fills in `neighborhood` for venues that already have coordinates from their own scraper (and therefore never went through forward geocoding) — this one's a plain column update, no RPC needed. |

### `src/api/`

| File | Purpose |
|---|---|
| `server.js` | Express server. Serves `public/index.html` with the Mapbox token injected. Three endpoints: `GET /api/events` (GeoJSON, filtered to NYC bounds, includes `source_name` for panel attribution), `GET /api/categories`, `POST /api/events/:id/status` (approve/reject). |

### `src/scrapers/`

| File | Purpose |
|---|---|
| `utils.js` | Shared helpers — date/time extraction from free text, price/free detection, text normalization (`normalizeText`, `buildSearchText`), `extractAgeRestriction`, `splitUSAddress` (handles commas, semicolons, trailing "USA"/"United States", and city+state+zip merged into one segment), `buildWeeklyRRule` |
| `runner.js` | Orchestrates all scrapers: logs a `scrape_runs` row per source, inserts rows into Supabase, geocodes new venues, then recomputes `can_display` (from current venue/review state) and duplicate groups (exact-match on `normalized_title` + calendar date) via RPC. There's no more `backfillDerivedFields` pass — every insert now goes through `upsertVenue`/`insertEvent`, which always compute these fields, so there are no legacy NULL gaps to backfill on a fresh Postgres table. A scraper that exports `venueOnly = true` + `fetchVenues()` (currently only `museums.js`) is routed through `upsertVenue()` alone, skipping `insertEvent()` entirely — for sources that supply permanent venues with no time-bound event to attach. |
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
| `instagram.js` | Instagram public accounts listed in `config/instagram_accounts.json`. Spawns `src/instagram/fetch.py` (Python/Instaloader) to fetch new posts, then calls `extractMedia` (Gemini Vision OCR on images and video keyframes) and `parseEvent` (Gemini structured extraction) per post. Requires `INSTAGRAM_USERNAME`, `INSTAGRAM_PASSWORD`, and `GEMINI_API_KEY`. All events land with `needs_review` status — nothing displays until approved. Source name: `instagram/@username`. Run alone with `npm run scrape:instagram`. |

### `src/instagram/`

The AI-powered extraction layer used exclusively by `instagram.js`. Requires a Gemini API key (free tier).

| File | Purpose |
|---|---|
| `fetch.py` | Python script (requires `pip install instaloader`). Reads accounts from `config/instagram_accounts.json`, loads a saved session from `~/.config/instaloader/session-<username>` (falls back to password login if absent), fetches only posts newer than the last-seen shortcode per account (state tracked in `data/instagram_state.json`), downloads media to `/tmp/instagram_media/`, and emits one JSONL line per post to stdout. Rate-limits with a 30–90s random delay between accounts. Pass `--dry-run` to skip login, media download, and state writes. |
| `extractMedia.js` | Accepts a list of local media paths. Images are base64-encoded and sent to Gemini Vision (`gemini-2.0-flash`). Videos are first split into keyframes via `ffmpeg` (1 frame every 10s), then each frame is sent to Gemini Vision. Returns all extracted text concatenated. |
| `parseEvent.js` | Sends caption text + extracted media text to Gemini (`gemini-2.0-flash`) with a structured prompt. Resolves relative dates against the post's timestamp, filters categories to the controlled vocab, and returns a structured event object or `null` if no event is found in the post. |

### `config/`

| File | Purpose |
|---|---|
| `instagram_accounts.json` | List of Instagram usernames to scrape. Edit this file to add or remove accounts — no code changes needed. |

### `scripts/`

| File | Purpose |
|---|---|
| `migrate-sqlite-to-supabase.js` | CLI entry point for `npm run migrate-sqlite` — one-time backfill, not part of the regular pipeline |
| `intake.js` | CLI entry point for `npm run intake <file.csv>` |
| `geocode-pending.js` | CLI entry point for `npm run geocode-pending` |
| `scrape.js` | CLI entry point for `npm run scrape`. Pass scraper names to run a subset (e.g. `node scripts/scrape.js luma instagram`). Pass `--skip-geocode` to skip the Mapbox geocoding and recompute passes. |
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
