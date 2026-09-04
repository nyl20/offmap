-- Staging table for social-media "paste a link" imports (TikTok first),
-- plus a submitted_by_user_id placeholder on events/venues so a live row
-- can eventually be traced back to whoever submitted it.
--
-- Confirmed imports still land in the existing events/venues tables via the
-- same insert_event/upsert_venue funnel every other scraper uses — this
-- table only holds the pre-confirmation draft (raw scrape + LLM extraction
-- with per-field provenance: source + verbatim quote), which events/venues
-- have no room for and shouldn't be made to carry for every other source.

-- IF NOT EXISTS / IF NOT EXISTS guards throughout this file: the first
-- attempt to run this migration failed partway through (the insert_event/
-- upsert_venue CREATE OR REPLACE calls below created a second, ambiguous
-- overload rather than replacing the existing one — see the drop-first fix
-- further down), so this needs to be safely re-runnable whether or not the
-- table/column statements above that failure point already committed.
create table if not exists social_import_drafts (
  id                    bigint generated always as identity primary key,
  platform              text not null,
  source_url            text not null,
  raw_data              jsonb not null default '{}'::jsonb,
  extracted_fields      jsonb not null default '{}'::jsonb,
  -- Placeholder: NULL until the web app's submission flow has an
  -- authenticated user to attribute this to.
  submitted_by_user_id  uuid references auth.users(id) on delete set null,
  status                text not null default 'draft' check (status in ('draft', 'confirmed', 'discarded')),
  event_id              bigint references events(id) on delete set null,
  venue_id              bigint references venues(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists idx_social_import_drafts_status     on social_import_drafts (status);
create index if not exists idx_social_import_drafts_source_url on social_import_drafts (source_url);

alter table social_import_drafts enable row level security;

-- Only the ingestion service (service_role) reads/writes drafts directly —
-- the web app talks to it through the ingestion API's /api/import routes,
-- not straight to Supabase, so no anon/authenticated policy is needed yet.
revoke all on social_import_drafts from public, anon, authenticated;
grant all on social_import_drafts to service_role;
grant usage, select on sequence social_import_drafts_id_seq to service_role;

-- ---------------------------------------------------- user attribution ---

alter table events add column if not exists submitted_by_user_id uuid references auth.users(id) on delete set null;
alter table venues add column if not exists submitted_by_user_id uuid references auth.users(id) on delete set null;

-- ------------------------------------------------------------ funnel ---

-- Drop every existing overload of insert_event/upsert_venue by its actual
-- live signature before recreating, rather than a bare CREATE OR REPLACE —
-- same technique 20260626000000 used, for the same reason: CREATE OR
-- REPLACE only safely replaces a function whose parameter list is
-- unchanged. Appending a new parameter (p_submitted_by_user_id, below)
-- doesn't count as "unchanged" even with a default value, so it silently
-- created a second, ambiguous overload on the first attempt at this
-- migration instead of replacing the original — this is what produced the
-- "function name is not unique" error. Dropping by regprocedure (which
-- captures the full existing signature) cleans up regardless of whether
-- one or several overloads currently exist.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('insert_event', 'upsert_venue')
  loop
    execute format('drop function %s', r.sig);
  end loop;
end $$;

create function insert_event(
  p_venue_id bigint,
  p_external_id text,
  p_title text,
  p_normalized_title text,
  p_description text,
  p_category text,
  p_tags text[],
  p_categories text[],
  p_sub_categories text[],
  p_search_text text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_timezone text,
  p_recurrence_rule text,
  p_price_text text,
  p_is_free boolean,
  p_age_restriction text,
  p_ticket_url text,
  p_organizer_name text,
  p_image_url text,
  p_image_source_url text,
  p_image_credit text,
  p_image_license text,
  p_source_url text,
  p_source_name text,
  p_fetched_at timestamptz,
  p_review_status text,
  p_confidence_score real,
  p_notes text,
  p_submitted_by_user_id uuid default null
)
returns boolean
language plpgsql
as $$
declare
  v_inserted boolean;
begin
  insert into events (
    venue_id, external_id, title, normalized_title, description, category, tags,
    categories, sub_categories, search_text,
    start_time, end_time, timezone, recurrence_rule,
    price_text, is_free, age_restriction,
    ticket_url, organizer_name,
    image_url, image_source_url, image_credit, image_license,
    source_url, source_name, source_fetched_at,
    review_status, confidence_score, notes, submitted_by_user_id
  ) values (
    p_venue_id, p_external_id, p_title, p_normalized_title, p_description, p_category, p_tags,
    p_categories, p_sub_categories, p_search_text,
    p_start_time, p_end_time, p_timezone, p_recurrence_rule,
    p_price_text, p_is_free, p_age_restriction,
    p_ticket_url, p_organizer_name,
    p_image_url, p_image_source_url, p_image_credit, p_image_license,
    p_source_url, p_source_name, p_fetched_at,
    p_review_status, p_confidence_score, p_notes, p_submitted_by_user_id
  )
  on conflict (source_url) do nothing;

  v_inserted := found;

  -- Refresh last_verified_at every time this source_url is seen again,
  -- whether this was a fresh insert or a re-scraped duplicate.
  update events set last_verified_at = p_fetched_at where source_url = p_source_url;

  return v_inserted;
end;
$$;

-- Same signature as 20260830000000, plus one new optional trailing param
-- (default null). Only the first insert sets submitted_by_user_id (COALESCE-
-- preserved on conflict, like every other scalar column here) — the first
-- submitter is credited, a later upsert from a different source doesn't
-- overwrite it.
create function upsert_venue(
  p_name text,
  p_address text,
  p_address_line text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country text,
  p_normalized_venue_name text,
  p_venue_opening_hours text,
  p_categories text[],
  p_sub_categories text[],
  p_lat double precision,
  p_lng double precision,
  p_geocode_provider text,
  p_geocode_confidence real,
  p_submitted_by_user_id uuid default null
)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
  v_location geography(point, 4326);
  v_is_suspect boolean;
begin
  if p_lat is not null and p_lng is not null then
    v_location := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  end if;

  v_is_suspect := (
    p_geocode_provider = 'OpenStreetMap'
    and cardinality(p_categories) = 1
    and p_categories && array['Arts & Crafts', 'Shopping']::text[]
    and coalesce(array_length(p_sub_categories, 1), 0) = 0
  );

  insert into venues (
    name, address, address_line, city, region, postal_code, country,
    normalized_venue_name, venue_opening_hours, categories, sub_categories,
    location, geocode_provider, geocode_confidence, geocoded_at,
    is_source_suspect, submitted_by_user_id
  ) values (
    p_name, p_address, p_address_line, p_city, p_region, p_postal_code, p_country,
    p_normalized_venue_name, p_venue_opening_hours, p_categories, p_sub_categories,
    v_location,
    case when v_location is not null then p_geocode_provider end,
    case when v_location is not null then p_geocode_confidence end,
    case when v_location is not null then now() end,
    v_is_suspect, p_submitted_by_user_id
  )
  on conflict (lower(trim(name)), lower(regexp_replace(trim(address), '\s+', ' ', 'g'))) do update set
    address_line          = coalesce(venues.address_line, excluded.address_line),
    city                  = coalesce(venues.city, excluded.city),
    region                = coalesce(venues.region, excluded.region),
    postal_code           = coalesce(venues.postal_code, excluded.postal_code),
    country               = coalesce(venues.country, excluded.country),
    normalized_venue_name = coalesce(venues.normalized_venue_name, excluded.normalized_venue_name),
    venue_opening_hours   = coalesce(venues.venue_opening_hours, excluded.venue_opening_hours),
    categories            = coalesce((select array_agg(distinct c) from unnest(venues.categories || excluded.categories) c), '{}'),
    sub_categories        = coalesce((select array_agg(distinct c) from unnest(venues.sub_categories || excluded.sub_categories) c), '{}'),
    location              = coalesce(venues.location, excluded.location),
    geocode_provider      = coalesce(venues.geocode_provider, excluded.geocode_provider),
    geocode_confidence    = coalesce(venues.geocode_confidence, excluded.geocode_confidence),
    geocoded_at           = coalesce(venues.geocoded_at, excluded.geocoded_at),
    submitted_by_user_id  = coalesce(venues.submitted_by_user_id, excluded.submitted_by_user_id),
    is_source_suspect     = venues.is_source_suspect or (
      excluded.geocode_provider = 'OpenStreetMap'
      and cardinality(excluded.categories) = 1
      and excluded.categories && array['Arts & Crafts', 'Shopping']::text[]
      and coalesce(array_length(excluded.sub_categories, 1), 0) = 0
    )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function insert_event from public;
revoke execute on function upsert_venue from public;
grant execute on function insert_event to service_role;
grant execute on function upsert_venue to service_role;
