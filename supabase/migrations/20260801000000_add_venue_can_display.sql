-- Venue display gate.
--
-- venues has had a completeness_score since 20260710000000, but nothing has
-- ever used it to gate what's actually shown — RLS lets every venue row
-- through regardless of how thin it is (bare address, no category, no
-- content). events already has this pattern (can_display, recomputed by
-- recompute_can_display, RLS restricted to can_display = true) — this adds
-- the equivalent for venues.
--
-- A venue displays if either:
--   - it's is_permanent (hand-curated landmark seeded in 20260626110000,
--     known-good by construction — gating it behind the same
--     auto-enrichment signals as a freshly-scraped OSM row would risk
--     hiding the Met/MoMA/Central Park if e.g. description happens to be
--     null), or
--   - it has a geocoded location, a non-empty address_line and city, at
--     least one category, AND at least one of {description, image_url,
--     website_url} — the last condition keeps a bare "we know its address"
--     stub hidden until it has some real content, not just coordinates.
--
-- postal_code is deliberately not required — it's tracked for merge-winner
-- scoring (completeness_score) but not essential for display.

alter table venues add column can_display boolean not null default false;

create index idx_venues_can_display on venues (can_display) where can_display;

create function recompute_venue_can_display()
returns integer
language sql
as $$
  with updated as (
    update venues v set can_display = (
      v.is_permanent
      or (
        v.location is not null
        and coalesce(trim(v.address_line), '') <> ''
        and coalesce(trim(v.city), '') <> ''
        and coalesce(array_length(v.categories, 1), 0) > 0
        and (
          coalesce(trim(v.description), '') <> ''
          or coalesce(trim(v.image_url), '') <> ''
          or coalesce(trim(v.website_url), '') <> ''
        )
      )
    )
    returning v.id
  )
  select count(*)::integer from updated;
$$;

revoke execute on function recompute_venue_can_display from public;
grant execute on function recompute_venue_can_display to service_role;

drop policy "Public read access to venues" on venues;

create policy "Public read access to displayable venues" on venues
  for select using (can_display);

-- events.can_display previously only checked that its venue was geocoded
-- (v.location is not null), not whether the venue itself is fit to display.
-- Now that venues has its own gate, an event whose venue fails it must also
-- be hidden — otherwise the event would show (can_display = true) while its
-- embedded `venues (...)` join comes back null under the new RLS policy
-- above, which is worse than not showing the event at all.
create or replace function recompute_can_display()
returns integer
language sql
as $$
  with updated as (
    update events e set can_display = (
      v.can_display
      and v.location is not null   -- defense-in-depth: is_permanent can bypass
                                    -- the venue gate without location being set
      and e.start_time is not null
      and e.review_status in ('candidate', 'approved')
    )
    from venues v
    where v.id = e.venue_id
    returning e.id
  )
  select count(*)::integer from updated;
$$;

-- Backfill immediately: recompute venues first (events depends on it), then
-- events, so this migration leaves the table in a consistent state rather
-- than waiting for the next scrape.
do $$ begin
  perform recompute_venue_can_display();
  perform recompute_can_display();
end $$;
