-- 20260903000000 added 3 new trailing parameters to upsert_venue(), but
-- CREATE OR REPLACE FUNCTION only replaces a function whose parameter type
-- list matches exactly — adding parameters (even with defaults) makes
-- Postgres treat it as a distinct overload instead. That left two
-- upsert_venue functions coexisting, which is why that migration's own
-- trailing `revoke`/`grant execute on function upsert_venue` (unqualified,
-- no argument list) failed with "function name is not unique": Postgres
-- couldn't tell which overload those statements meant.
--
-- Fix: explicitly drop the old 16-argument overload by its exact type
-- signature (types/count only — argument names and defaults don't factor
-- into this match), then re-assert the new 19-argument function and grant
-- its permissions using an explicit signature so there's never ambiguity,
-- regardless of whether 20260903000000's CREATE OR REPLACE itself
-- committed before that migration's script aborted.
drop function if exists upsert_venue(
  text, text, text, text, text, text, text, text, text,
  text[], text[], double precision, double precision, text, real, uuid
);

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

revoke execute on function upsert_venue(
  text, text, text, text, text, text, text, text, text,
  text[], text[], double precision, double precision, text, real,
  uuid, text, text, text
) from public;

grant execute on function upsert_venue(
  text, text, text, text, text, text, text, text, text,
  text[], text[], double precision, double precision, text, real,
  uuid, text, text, text
) to service_role;
