-- Makes `is_permanent` evidence-based instead of a static scraper-origin
-- flag. Today the ONLY code that ever sets it true is runner.js's
-- venueOnly-scraper branch (museums.js/local-spots.js) — every event-sourced
-- venue stays at its `false` default forever, no matter how many real
-- events it goes on to host. This was the original intent of is_permanent
-- (see 20260626110000_add_venue_permanence.sql's own doc comment: "a venue
-- that only exists in our data because a one-off event happened to be held
-- there [...] vs. a permanent, standing place") but nothing ever
-- implemented the promotion side of that distinction.
--
-- Three tiers, going forward:
--   1. Hard-capped, never promotable: community/recreation/senior centers by
--      name, and a venue whose name is literally its own neighborhood (e.g.
--      "Yorkville"). These can still be an event's location — just never a
--      standalone place.
--   2. Already permanent via a curated venue-only scraper — untouched.
--   3. Evidence-promotable — everything else, including bars/clubs and real
--      parks/landmarks, once they've demonstrably hosted more than one event.

alter table venues add column lifetime_event_count integer not null default 0;
alter table venues add column had_recurring_event boolean not null default false;

comment on column venues.lifetime_event_count is
  'Sticky counter of every event ever inserted for this venue, incremented by bump_venue_event_stats(). Never decremented — immune to purge_past_events() deleting the underlying event rows, so a monthly series (never 2 events present at once) still accumulates evidence toward is_permanent promotion.';
comment on column venues.had_recurring_event is
  'True if any event ever inserted for this venue carried a non-null recurrence_rule — strong standalone evidence of a regular series, promotes immediately regardless of lifetime_event_count.';

-- ----------------------------------------------------------- counters ---

create function bump_venue_event_stats()
returns trigger
language plpgsql
as $$
begin
  update venues set
    lifetime_event_count = lifetime_event_count + 1,
    had_recurring_event   = had_recurring_event or (new.recurrence_rule is not null)
  where id = new.venue_id;
  return new;
end;
$$;

-- AFTER INSERT ON events only fires for rows actually inserted — insert_event's
-- ON CONFLICT (source_url) DO NOTHING means a re-scraped duplicate never
-- double-counts.
create trigger trg_bump_venue_event_stats
  after insert on events
  for each row
  execute function bump_venue_event_stats();

-- ---------------------------------------------------------- promotion ---

-- Mirrors db/venue-quality.js's GENERIC_MUNICIPAL_RE, deliberately minus
-- "pool" — "Union Pool" is a real live-music bar, not a swimming pool, and
-- should be free to earn permanence the same way any bar/club does. Keep
-- this regex in sync with that file if the tier-1 cap scope ever changes.
create function recompute_venue_permanence(p_threshold integer default 2)
returns integer
language sql
as $$
  with updated as (
    update venues v set is_permanent = true
    where not v.is_permanent
      and not v.is_source_suspect
      and v.name !~* '\b(community cent(er|re)|rec(reation)? cent(er|re)|senior cent(er|re))\b'
      and not (v.neighborhood is not null and lower(trim(v.name)) = lower(trim(v.neighborhood)))
      and (v.lifetime_event_count >= p_threshold or v.had_recurring_event)
    returning v.id
  )
  select count(*)::integer from updated;
$$;

revoke execute on function recompute_venue_permanence(integer) from public;
grant execute on function recompute_venue_permanence(integer) to service_role;

-- ------------------------------------------------------- orphan purge ---

-- events.venue_id has no ON DELETE clause (NO ACTION), so a venue can never
-- be deleted while an event still references it — safe to delete any
-- non-permanent venue with zero remaining events outright.
create function purge_orphaned_temporary_venues()
returns integer
language sql
as $$
  with deleted as (
    delete from venues v
    where not v.is_permanent
      and not exists (select 1 from events e where e.venue_id = v.id)
    returning v.id
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function purge_orphaned_temporary_venues from public;
grant execute on function purge_orphaned_temporary_venues to service_role;

select cron.schedule(
  'purge-orphaned-temporary-venues',
  '5 * * * *',  -- hourly, 5 minutes after purge-past-events so its deletes have already landed
  $$ select purge_orphaned_temporary_venues(); $$
);

-- ------------------------------------------------------------- merge ----

-- Extends merge_venue_into (20260830000000_add_venue_source_suspect_flag.sql:129)
-- to fold the two new columns — without this, merging a venue would silently
-- erase its accumulated promotion evidence.
create or replace function merge_venue_into(p_winner_id bigint, p_loser_id bigint)
returns void
language plpgsql
as $$
begin
  update events set venue_id = p_winner_id where venue_id = p_loser_id;

  update venues w set
    address_line          = coalesce(w.address_line, l.address_line),
    city                   = coalesce(w.city, l.city),
    region                 = coalesce(w.region, l.region),
    postal_code            = coalesce(w.postal_code, l.postal_code),
    neighborhood           = coalesce(w.neighborhood, l.neighborhood),
    venue_opening_hours    = coalesce(w.venue_opening_hours, l.venue_opening_hours),
    description            = coalesce(w.description, l.description),
    phone                  = coalesce(w.phone, l.phone),
    image_url              = coalesce(w.image_url, l.image_url),
    website_url            = coalesce(w.website_url, l.website_url),
    location               = coalesce(w.location, l.location),
    geocode_provider       = coalesce(w.geocode_provider, l.geocode_provider),
    geocode_confidence     = coalesce(w.geocode_confidence, l.geocode_confidence),
    geocoded_at            = coalesce(w.geocoded_at, l.geocoded_at),
    is_permanent           = w.is_permanent or l.is_permanent,
    is_source_suspect      = w.is_source_suspect or l.is_source_suspect,
    lifetime_event_count   = w.lifetime_event_count + l.lifetime_event_count,
    had_recurring_event    = w.had_recurring_event or l.had_recurring_event,
    categories             = coalesce((select array_agg(distinct c) from unnest(w.categories || l.categories) c), '{}'),
    sub_categories         = coalesce((select array_agg(distinct c) from unnest(w.sub_categories || l.sub_categories) c), '{}')
  from venues l
  where w.id = p_winner_id and l.id = p_loser_id;

  delete from venues where id = p_loser_id;
end;
$$;

-- ------------------------------------------------- one-time correction ---

-- Force is_permanent=false for existing rows matching the tier-1 cap, which
-- may have been left stale from before local-spots.js's "amenity"=
-- "community_centre" OSM allowlist entry was removed (prior session) — that
-- was the actual leak source for generic municipal community centers
-- getting is_permanent=true unconditionally via the venueOnly scraper
-- branch. The intentional exception to is_permanent otherwise being
-- append-only/sticky.
update venues
set is_permanent = false
where is_permanent
  and (
    name ~* '\b(community cent(er|re)|rec(reation)? cent(er|re)|senior cent(er|re))\b'
    or (neighborhood is not null and lower(trim(name)) = lower(trim(neighborhood)))
  );
