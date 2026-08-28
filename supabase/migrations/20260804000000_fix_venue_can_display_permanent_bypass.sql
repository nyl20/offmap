-- Fixes a bug in 20260803000000's recompute_venue_can_display(): the
-- is_permanent bypass ("v.is_permanent or (...)") was written assuming
-- is_permanent means "a small, hand-curated set of marquee landmarks" (the
-- ~12 rows seeded in 20260626110000). In production it means something much
-- broader — runner.js's venueOnly scraper branch sets is_permanent = true
-- unconditionally on EVERY row any venue-only scraper (local-spots.js,
-- museums.js) touches, "permanent" meaning only "not a one-off event venue"
-- (see 20260626110000's own doc comment: "anything [the venueOnly scraper]
-- has produced is permanent by construction"). That's 2130 of 2204
-- OpenStreetMap-sourced venues — is_permanent was completely bypassing the
-- suspect-junk exclusion for nearly every OSM row, including the exact junk
-- (White Glove Cleaner, Davis Pest Control, ...) 20260803000000 was written
-- to hide.
--
-- Fix: is_permanent still excuses a venue from needing rich content
-- (address_line/city/description-or-image-or-website) — that's its
-- legitimate original purpose, trusting that a venue-only scraper found a
-- real standing place even if some fields are sparse. But it no longer
-- bypasses the suspect-junk check, or the base location/categories
-- requirements — being "permanent" and being miscategorized junk aren't
-- mutually exclusive, so nothing should be able to bypass the junk check.
--
-- Verified against production data before writing this (JS reproduction of
-- both the old and new SQL against all 4189 venues): 859 currently-visible
-- suspect-junk venues flip to hidden, 0 currently-visible legitimate venues
-- (spot-checked Whitney, AMNH, Brooklyn Botanic Garden, The High Line) are
-- newly hidden as a side effect.

create or replace function recompute_venue_can_display()
returns integer
language sql
as $$
  with updated as (
    update venues v set can_display = (
      v.location is not null
      and coalesce(array_length(v.categories, 1), 0) > 0
      and (
        v.is_permanent
        or (
          coalesce(trim(v.address_line), '') <> ''
          and coalesce(trim(v.city), '') <> ''
          and (
            coalesce(trim(v.description), '') <> ''
            or coalesce(trim(v.image_url), '') <> ''
            or coalesce(trim(v.website_url), '') <> ''
          )
        )
      )
      and not (
        v.geocode_provider = 'OpenStreetMap'
        and cardinality(v.categories) = 1
        and v.categories && array['Arts & Crafts', 'Shopping']::text[]
        and coalesce(array_length(v.sub_categories, 1), 0) = 0
      )
    )
    where true
    returning v.id
  )
  select count(*)::integer from updated;
$$;

do $$ begin
  perform recompute_venue_can_display();
  perform recompute_can_display();
end $$;
