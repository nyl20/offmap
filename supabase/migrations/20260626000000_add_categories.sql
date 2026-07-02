-- Two-level category system for events and venues.
--
-- `categories` is a controlled vocabulary, schema-enforced via a CHECK +
-- array-containment (<@) constraint. The list here must stay in sync with
-- CATEGORIES in MapApp/src/scrapers/classify.js.
--
-- `sub_categories` is intentionally unconstrained free text — new values
-- emerge from classify.js's keyword rules with no migration required.
--
-- Both columns are populated centrally in db/funnel.js (insertEvent /
-- upsertVenue) — the same place normalized_title/search_text are computed —
-- so no individual scraper needs to change. The existing `tags` column is
-- untouched; categories/sub_categories are separate from it.

alter table events add column categories     text[] not null default '{}';
alter table events add column sub_categories text[] not null default '{}';

alter table venues add column categories     text[] not null default '{}';
alter table venues add column sub_categories text[] not null default '{}';

alter table events add constraint events_categories_vocab check (
  categories <@ array[
    'Music', 'Nightlife', 'Visual Arts & Museums', 'Arts & Crafts',
    'Arts & Performance', 'Outdoors & Nature', 'Food & Drink',
    'Community & Culture', 'Talks & Education', 'Wellness', 'Fashion', 'Shopping'
  ]::text[]
);

alter table venues add constraint venues_categories_vocab check (
  categories <@ array[
    'Music', 'Nightlife', 'Visual Arts & Museums', 'Arts & Crafts',
    'Arts & Performance', 'Outdoors & Nature', 'Food & Drink',
    'Community & Culture', 'Talks & Education', 'Wellness', 'Fashion', 'Shopping'
  ]::text[]
);

create index idx_events_categories     on events using gin (categories);
create index idx_events_sub_categories on events using gin (sub_categories);
create index idx_venues_categories     on venues using gin (categories);
create index idx_venues_sub_categories on venues using gin (sub_categories);

-- Drop both RPCs by their actual (possibly-overloaded) signatures rather
-- than hand-typing the old parameter list — safer than risking a stale
-- signature that leaves an orphaned overload behind.
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
  p_notes text
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
    review_status, confidence_score, notes
  ) values (
    p_venue_id, p_external_id, p_title, p_normalized_title, p_description, p_category, p_tags,
    p_categories, p_sub_categories, p_search_text,
    p_start_time, p_end_time, p_timezone, p_recurrence_rule,
    p_price_text, p_is_free, p_age_restriction,
    p_ticket_url, p_organizer_name,
    p_image_url, p_image_source_url, p_image_credit, p_image_license,
    p_source_url, p_source_name, p_fetched_at,
    p_review_status, p_confidence_score, p_notes
  )
  on conflict (source_url) do nothing;

  v_inserted := found;

  -- Refresh last_verified_at every time this source_url is seen again,
  -- whether this was a fresh insert or a re-scraped duplicate.
  update events set last_verified_at = p_fetched_at where source_url = p_source_url;

  return v_inserted;
end;
$$;

-- upsert_venue: categories/sub_categories UNION across calls rather than
-- COALESCE like the other columns — the same physical venue gets upserted
-- repeatedly by different scrapers/events over time, each contributing a
-- partial signal (e.g. one event tags a venue "Nightlife", a later one
-- adds "Music"), so we want the union to grow rather than freeze on the
-- first call's value.
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
  p_geocode_confidence real
)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
  v_location geography(point, 4326);
begin
  if p_lat is not null and p_lng is not null then
    v_location := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  end if;

  insert into venues (
    name, address, address_line, city, region, postal_code, country,
    normalized_venue_name, venue_opening_hours, categories, sub_categories,
    location, geocode_provider, geocode_confidence, geocoded_at
  ) values (
    p_name, p_address, p_address_line, p_city, p_region, p_postal_code, p_country,
    p_normalized_venue_name, p_venue_opening_hours, p_categories, p_sub_categories,
    v_location,
    case when v_location is not null then p_geocode_provider end,
    case when v_location is not null then p_geocode_confidence end,
    case when v_location is not null then now() end
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
    geocoded_at           = coalesce(venues.geocoded_at, excluded.geocoded_at)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function insert_event from public;
revoke execute on function upsert_venue from public;
grant execute on function insert_event to service_role;
grant execute on function upsert_venue to service_role;
