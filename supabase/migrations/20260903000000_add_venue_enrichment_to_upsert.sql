-- Lets scrapers pass venue-level website/image/description at upsert time,
-- instead of relying exclusively on the separate enrichVenuesFromWebsite()
-- maintenance pass (db/enrich-venues.js). That pass only ever considers
-- venues that ALREADY have a non-null website_url — a catch-22 for any
-- scraper whose source never seeds one. Verified live against Luma: every
-- Luma-sourced venue has description/image_url/website_url all null forever
-- (upsert_venue never accepted them, and nothing else sets website_url for
-- these venues), which permanently fails recompute_venue_can_display()'s
-- "at least one of description/image_url/website_url" requirement — the
-- real reason Luma events never display, independent of completeness_score.
-- Luma's own per-event host record already carries a real website/avatar/bio
-- (e.g. Studio KARO: website "https://www.karocrafts.com", a real avatar
-- image, a real bio) — this migration is what lets that data reach the
-- venue row at all.
--
-- Same signature as 20260902000000, plus three new optional trailing params
-- (default null), COALESCE-preserved on conflict like every other field
-- here — a later upsert never overwrites an already-set value.
create or replace function upsert_venue(
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
  p_submitted_by_user_id uuid default null,
  p_website_url text default null,
  p_image_url text default null,
  p_description text default null
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
    is_source_suspect, submitted_by_user_id,
    website_url, image_url, description
  ) values (
    p_name, p_address, p_address_line, p_city, p_region, p_postal_code, p_country,
    p_normalized_venue_name, p_venue_opening_hours, p_categories, p_sub_categories,
    v_location,
    case when v_location is not null then p_geocode_provider end,
    case when v_location is not null then p_geocode_confidence end,
    case when v_location is not null then now() end,
    v_is_suspect, p_submitted_by_user_id,
    p_website_url, p_image_url, p_description
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
    website_url           = coalesce(venues.website_url, excluded.website_url),
    image_url             = coalesce(venues.image_url, excluded.image_url),
    description           = coalesce(venues.description, excluded.description),
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

revoke execute on function upsert_venue from public;
grant execute on function upsert_venue to service_role;
