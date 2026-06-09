# OFFMAP Build Plan

## Stack

- Expo + React Native + TypeScript for the mobile app.
- Expo Router for file-based navigation.
- Supabase Auth and Postgres/PostGIS for users, saved events, and location queries.
- @rnmapbox/maps for the native map experience.
- TanStack Query for server-state fetching/caching.
- Zustand for local UI state such as filters and selected map region.

## Phase 1: App Foundation

- Scaffold Expo app and keep routes in `src/app`.
- Add tabs: Map, Search, Saved, Profile.
- Add event detail route at `src/app/event/[id].tsx`.
- Add Supabase client, QueryClient provider, filter store, and event types.
- Add `.env.example` with public Supabase and Mapbox keys.
- Create an Expo development build before rendering Mapbox natively.

## Phase 2: Supabase + PostGIS

- Create tables: `events`, `venues`, `saved_events`, `profiles`, and optionally `event_sources`.
- Enable PostGIS and store coordinates as a `geography(Point, 4326)` column.
- Add an RPC such as `nearby_events(lat, lng, radius_meters, starts_after)` using `ST_DWithin`.
- Add row-level security: public read for approved events, user-scoped access for saved events.
- Seed curated events manually before automating ingestion.

## Phase 3: Map Experience

- Add `@rnmapbox/maps` token setup and create a development build.
- Render events as clustered pins.
- Fetch by map bounds and current filters with TanStack Query.
- Add selected event bottom sheet and list view.
- Request foreground location through `expo-location`.

## Phase 4: Data Ingestion

Start curated, then automate. Event discovery quality is the hardest product problem, so the data pipeline should have review/moderation from day one.

Recommended ingestion pipeline:

1. Source connector pulls candidate events into a staging table.
2. Normalizer extracts title, dates, venue, category, price, images, and source URL.
3. Geocoder resolves venue/address to coordinates.
4. Deduper compares source URL, normalized title, venue, date, and distance.
5. Admin review approves, edits, rejects, or merges.
6. Approved events become visible in the app.

Good initial sources:

- Manual/admin entry for high-quality MVP inventory.
- Public APIs like Ticketmaster, Eventbrite partner/API access where available, venue calendars, museum APIs, city open data, and RSS/newsletter feeds.
- User submissions with moderation.
- Scraping only for sources whose terms allow it and whose markup is stable enough to maintain.

## Can Google APIs Be Used?

Yes, but Google is better as a venue/geocoding/enrichment layer than as the primary source of pop-up events.

Useful Google APIs:

- Places API: find and enrich venues, names, addresses, categories, website URLs, hours, photos, and coordinates.
- Geocoding API: convert event addresses to latitude/longitude.
- Maps SDK or URLs: open navigation directions from an event detail page.

Limits to be aware of:

- Places data is venue-oriented. It usually will not give complete event calendars for galleries, pop-ups, underground shows, markets, or one-off happenings.
- Google API terms and pricing matter. Do not cache or redistribute fields without checking allowed usage for the specific API/data field.
- Google should not be treated as permission to scrape Google Search/Maps results. Use official APIs.

Best use in OFFMAP:

- Use event APIs/manual submissions as the event source.
- Use Google Places or Mapbox Search/Geocoding to resolve and enrich venue records.
- Store your own event records in Supabase/PostGIS.
