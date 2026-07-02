-- Fixes two bugs in upsert_venue (20260621000001_funnel_functions.sql):
--
-- 1. The ON CONFLICT ... DO UPDATE clause never touched location/
--    geocode_provider/geocode_confidence/geocoded_at. If a venue row already
--    existed for the same (name, address) without coordinates, a later
--    upsert_venue call carrying real scraper-supplied coordinates (BBG,
--    museums.js, Resident Advisor, etc.) silently dropped them — the venue
--    fell back to a redundant, less-accurate Mapbox geocode instead.
--
-- 2. The (name, address) unique constraint matched on raw text, so the same
--    physical venue scraped by two sources with slightly different casing or
--    whitespace ("The Bell House" vs "the bell house ") created two venue
--    rows instead of one. Replaced with a case/whitespace-normalized
--    expression index — still exact-match (no fuzzy/abbreviation handling),
--    just insensitive to formatting noise.

alter table venues drop constraint if exists venues_name_address_key;

create unique index venues_name_address_normalized_key
  on venues (lower(trim(name)), lower(regexp_replace(trim(address), '\s+', ' ', 'g')));

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
    normalized_venue_name, venue_opening_hours,
    location, geocode_provider, geocode_confidence, geocoded_at
  ) values (
    p_name, p_address, p_address_line, p_city, p_region, p_postal_code, p_country,
    p_normalized_venue_name, p_venue_opening_hours,
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
    location              = coalesce(venues.location, excluded.location),
    geocode_provider      = coalesce(venues.geocode_provider, excluded.geocode_provider),
    geocode_confidence    = coalesce(venues.geocode_confidence, excluded.geocode_confidence),
    geocoded_at           = coalesce(venues.geocoded_at, excluded.geocoded_at)
  returning id into v_id;

  return v_id;
end;
$$;

-- CREATE OR REPLACE preserves the existing grants from 20260621000001, but
-- restate them so this migration is correct read on its own.
revoke execute on function upsert_venue from public;
grant execute on function upsert_venue to service_role;
