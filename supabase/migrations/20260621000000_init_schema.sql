-- Initial schema for the NYC events pipeline (MapApp scrapers -> Supabase ->
-- offmap mobile/web). Ported from MapApp/src/db/schema.sql (SQLite), upgraded
-- to native Postgres/PostGIS types: geography points instead of bare
-- lat/lng columns, text[] instead of JSON-as-text for tags, and a generated
-- tsvector for full-text search.

create extension if not exists postgis;

-- ============================================================== venues ====

create table venues (
  id                     bigint generated always as identity primary key,
  name                   text not null,
  address                text not null,                  -- full free-text address (display)
  address_line           text,                            -- street portion only, when parseable
  city                   text,
  region                 text,                            -- state/province
  postal_code            text,
  country                text default 'US',
  normalized_venue_name  text,                            -- lowercased, punctuation-stripped, for dedup matching
  location               geography(point, 4326),          -- null until geocoded
  latitude               double precision generated always as (st_y(location::geometry)) stored,
  longitude              double precision generated always as (st_x(location::geometry)) stored,
  neighborhood           text,
  venue_opening_hours    text,                            -- free text; no current source provides structured hours
  geocode_provider       text,
  geocode_confidence     real,
  geocoded_at            timestamptz,
  constraint venues_name_address_key unique (name, address)
);

create index idx_venues_location on venues using gist (location);

-- ============================================================== events ====

create table events (
  id                  bigint generated always as identity primary key,
  venue_id            bigint not null references venues(id),
  external_id         text,                    -- source's own ID for this event (e.g. RA event id, Luma api_id)
  duplicate_group_id  text,                    -- shared across events recomputed as likely duplicates
  title               text not null,
  normalized_title    text,                    -- lowercased, punctuation-stripped, for dedup matching
  description         text,
  category            text,
  tags                text[] not null default '{}',
  search_text         text,                    -- concatenated title+description+venue+tags, lowercased
  search_vector       tsvector generated always as (to_tsvector('english', coalesce(search_text, ''))) stored,
  start_time          timestamptz not null,
  end_time            timestamptz,
  timezone            text,
  recurrence_rule     text,                    -- RFC 5545 RRULE string, when a recurring schedule is detected
  price_text          text,
  is_free             boolean not null default false,
  age_restriction     text,                    -- e.g. "21+", "18+"
  ticket_url          text,                    -- defaults to source_url when no distinct ticket link exists
  organizer_name      text,
  image_url           text,
  image_source_url    text,                    -- page the image was sourced from
  image_credit        text,
  image_license       text,
  can_display         boolean not null default false,  -- recomputed: geocoded + not expired + reviewable
  source_url          text not null,
  source_name         text,
  source_fetched_at   timestamptz not null,    -- when we first scraped this row
  source_updated_at   timestamptz,             -- when the source says it last changed (rarely available)
  last_verified_at    timestamptz,             -- refreshed every time a later scrape re-sees this source_url
  review_status       text not null default 'candidate'
                        check (review_status in ('candidate','needs_review','approved','rejected','expired','duplicate')),
  confidence_score    real check (confidence_score between 0 and 1),
  notes               text,                    -- free-form moderator/system notes; not auto-populated
  constraint events_source_url_key unique (source_url)
);

create index idx_events_review_status on events (review_status);
create index idx_events_start_time     on events (start_time);
create index idx_events_venue_id       on events (venue_id);
create index idx_events_can_display    on events (can_display) where can_display;
create index idx_events_dup_group     on events (duplicate_group_id);
create index idx_events_search_vector on events using gin (search_vector);
create index idx_events_tags          on events using gin (tags);

-- ====================================================== scrape_runs ====
-- Funnel observability: one row per scraper per `npm run scrape` invocation.

create table scrape_runs (
  id              bigint generated always as identity primary key,
  source_name     text not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  inserted_count  integer not null default 0,
  skipped_count   integer not null default 0,
  error_count     integer not null default 0,
  error_message   text
);

create index idx_scrape_runs_source_started on scrape_runs (source_name, started_at desc);

-- ==================================================== saved_events ====
-- offmap mobile app feature (docs/plan.md Phase 2) — users bookmarking events.

create table saved_events (
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    bigint not null references events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ======================================================== profiles ====

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =========================================================== RLS ====
-- Backend (runner.js/server.js) connects as the `postgres` role over a
-- direct Postgres connection, which bypasses RLS entirely. These policies
-- only govern what the offmap mobile/web app can do with a public
-- anon/authenticated Supabase client.

alter table venues       enable row level security;
alter table events       enable row level security;
alter table saved_events enable row level security;
alter table profiles     enable row level security;
-- scrape_runs has RLS enabled with no policies below -> denied to anon/authenticated, backend-only.
alter table scrape_runs  enable row level security;

create policy "Public read access to venues" on venues
  for select using (true);

create policy "Public read access to displayable events" on events
  for select using (can_display);

create policy "Users manage own saved events" on saved_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Public read access to profiles" on profiles
  for select using (true);

create policy "Users update own profile" on profiles
  for update using (auth.uid() = id);

-- ===================================================== nearby_events ====
-- Per docs/plan.md Phase 2: RPC for map-bounds/radius queries from the
-- mobile app, e.g. supabase.rpc('nearby_events', { lat, lng, radius_meters }).

create function nearby_events(
  lat double precision,
  lng double precision,
  radius_meters integer,
  starts_after timestamptz default now()
)
returns setof events
language sql
stable
as $$
  select e.*
  from events e
  join venues v on v.id = e.venue_id
  where e.can_display
    and e.start_time >= starts_after
    and v.location is not null
    and st_dwithin(v.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_meters)
  order by e.start_time;
$$;
