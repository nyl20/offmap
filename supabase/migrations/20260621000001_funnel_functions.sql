-- Backend write path for the scraper funnel (runner.js, geocoding/mapbox.js).
--
-- The Express backend can only reach Supabase over its HTTPS Data API (the
-- direct Postgres host is IPv6-only and unreachable from this network, and
-- PostgREST has no generic "run arbitrary SQL" endpoint), so anything that
-- needs more than a plain insert/update/select — building a PostGIS point,
-- COALESCE-based progressive enrichment, or a set-based recompute — is
-- expressed here as a SQL function and called via supabase.rpc(...).
--
-- These run as SECURITY INVOKER (the default): the caller's own role needs
-- table privileges, so we explicitly restrict EXECUTE to service_role only.
-- Without that, Postgres' default PUBLIC execute grant would let the
-- publishable/anon key call them directly, bypassing the RLS policies from
-- the previous migration entirely.

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
  on conflict (name, address) do update set
    address_line          = coalesce(venues.address_line, excluded.address_line),
    city                  = coalesce(venues.city, excluded.city),
    region                = coalesce(venues.region, excluded.region),
    postal_code           = coalesce(venues.postal_code, excluded.postal_code),
    country                = coalesce(venues.country, excluded.country),
    normalized_venue_name = coalesce(venues.normalized_venue_name, excluded.normalized_venue_name),
    venue_opening_hours   = coalesce(venues.venue_opening_hours, excluded.venue_opening_hours)
  returning id into v_id;

  return v_id;
end;
$$;

create function insert_event(
  p_venue_id bigint,
  p_external_id text,
  p_title text,
  p_normalized_title text,
  p_description text,
  p_category text,
  p_tags text[],
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
    venue_id, external_id, title, normalized_title, description, category, tags, search_text,
    start_time, end_time, timezone, recurrence_rule,
    price_text, is_free, age_restriction,
    ticket_url, organizer_name,
    image_url, image_source_url, image_credit, image_license,
    source_url, source_name, source_fetched_at,
    review_status, confidence_score, notes
  ) values (
    p_venue_id, p_external_id, p_title, p_normalized_title, p_description, p_category, p_tags, p_search_text,
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

create function set_venue_geocode(
  p_venue_id bigint,
  p_lat double precision,
  p_lng double precision,
  p_neighborhood text,
  p_confidence real,
  p_provider text default 'mapbox'
)
returns void
language plpgsql
as $$
begin
  update venues set
    location           = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    neighborhood       = coalesce(p_neighborhood, neighborhood),
    geocode_provider   = p_provider,
    geocode_confidence = p_confidence,
    geocoded_at        = now()
  where id = p_venue_id;
end;
$$;

create function recompute_can_display()
returns integer
language sql
as $$
  with updated as (
    update events e set can_display = (
      v.location is not null
      and e.start_time is not null
      and e.review_status in ('candidate', 'approved')
    )
    from venues v
    where v.id = e.venue_id
    returning e.id
  )
  select count(*)::integer from updated;
$$;

create function recompute_duplicate_groups()
returns jsonb
language plpgsql
as $$
declare
  v_group_count integer;
  v_event_count integer;
begin
  update events set duplicate_group_id = null where review_status in ('candidate', 'approved');

  with groups as (
    select id, normalized_title, start_time::date as start_date,
           min(id) over (partition by normalized_title, start_time::date) as group_min,
           count(*) over (partition by normalized_title, start_time::date) as group_size
    from events
    where review_status in ('candidate', 'approved')
      and normalized_title is not null
      and length(normalized_title) > 4
  ),
  updated as (
    update events e set duplicate_group_id = 'dup-' || g.group_min
    from groups g
    where e.id = g.id and g.group_size > 1
    returning g.group_min
  )
  select count(distinct group_min), count(*) into v_group_count, v_event_count from updated;

  return jsonb_build_object('group_count', coalesce(v_group_count, 0), 'event_count', coalesce(v_event_count, 0));
end;
$$;

revoke execute on function upsert_venue              from public;
revoke execute on function insert_event               from public;
revoke execute on function set_venue_geocode          from public;
revoke execute on function recompute_can_display      from public;
revoke execute on function recompute_duplicate_groups from public;

grant execute on function upsert_venue              to service_role;
grant execute on function insert_event               to service_role;
grant execute on function set_venue_geocode          to service_role;
grant execute on function recompute_can_display      to service_role;
grant execute on function recompute_duplicate_groups to service_role;
