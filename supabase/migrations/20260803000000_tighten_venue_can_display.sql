-- Close a loophole in the venue can_display gate (20260801000000): a venue
-- whose ONLY category is the generic 'Arts & Crafts'/'Shopping' alias (see
-- classify.js CATEGORY_ALIASES craft->'Arts & Crafts', shop->'Shopping')
-- with no sub_categories was passing the gate as soon as it had *any*
-- description/image/website — which every real business with a website
-- trivially satisfies, regardless of whether it's actually a relevant
-- cultural venue. In production this let stale pre-allowlist-fix rows
-- (watch repair, pest control, plumbing, catering — see
-- db/purge-service-trade-venues.js's TRADE_KEYWORDS doc comment for the
-- original bug) become visible again the moment anything enriched them with
-- website content, even content as unreliable as a hijacked/spam page (one
-- of these rows' scraped description was gambling-site spam pulled straight
-- from its own compromised website).
--
-- local-spots.js now tags every OSM craft=*/shop=* match it fetches with a
-- SPECIFIC sub-category (Pottery, Books, Vintage, etc — see its
-- CRAFT_SUBCATEGORY/SHOP_SUBCATEGORY maps), not just the collapsed 'Arts &
-- Crafts'/'Shopping' top-level hint. Since local-spots.js re-upserts (and
-- sub_categories UNIONs, never shrinks — see upsert_venue in
-- 20260626000000) every currently-allowlisted match on every scrape run,
-- any OSM venue that's still missing a sub_category despite this is
-- presumptively a stale row the current (tightened) Overpass query no
-- longer fetches — not a false negative that a future run might fix.
--
-- Scoped to geocode_provider = 'OpenStreetMap' specifically — this generic-
-- alias-with-no-subcategory pattern is an artifact of local-spots.js's
-- category hint collapsing, not a general signal applicable to venues from
-- other sources.
--
-- Also fixes a separate, unrelated bug discovered while testing this
-- change: this project's Supabase instance rejects any UPDATE with no
-- WHERE clause at all when it's issued through the PostgREST/RPC path
-- (i.e. supabase.rpc(...) from runner.js) — it succeeds when the exact same
-- statement runs inside a migration's own `do $$ ... end $$` block via the
-- SQL Editor, which is why this went unnoticed: every one of these
-- functions' one-time backfills (run at migration-apply time) worked, but
-- the *same function* has been silently failing every time runner.js has
-- ever called it live. `where true` is a no-op filter that satisfies the
-- check without changing which rows get updated. Confirmed by directly
-- invoking both functions via supabase.rpc(...):
--   recompute_venue_completeness_scores -> ERROR: UPDATE requires a WHERE clause
--   recompute_venue_can_display         -> ERROR: UPDATE requires a WHERE clause
-- recompute_can_display and recompute_completeness_scores (both on events)
-- were unaffected — they already have a WHERE via their `from venues v
-- where v.id = e.venue_id` join condition.

create or replace function recompute_venue_can_display()
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
        and not (
          v.geocode_provider = 'OpenStreetMap'
          and cardinality(v.categories) = 1
          and v.categories && array['Arts & Crafts', 'Shopping']::text[]
          and coalesce(array_length(v.sub_categories, 1), 0) = 0
        )
      )
    )
    where true
    returning v.id
  )
  select count(*)::integer from updated;
$$;

-- Pre-existing function (20260710000000) with the same missing-WHERE bug —
-- otherwise identical to its original definition.
create or replace function recompute_venue_completeness_scores()
returns integer
language sql
as $$
  with updated as (
    update venues v set completeness_score = (
      (case when v.location is not null then 1 else 0 end) +
      (case when coalesce(trim(v.address_line), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(v.city), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(v.postal_code), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(v.venue_opening_hours), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(v.description), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(v.image_url), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(v.phone), '') <> '' then 1 else 0 end) +
      (case when coalesce(trim(v.website_url), '') <> '' then 1 else 0 end) +
      (case when coalesce(array_length(v.categories, 1), 0) > 0 then 1 else 0 end)
    )::real / 10
    where true
    returning v.id
  )
  select count(*)::integer from updated;
$$;

do $$ begin
  perform recompute_venue_completeness_scores();
  perform recompute_venue_can_display();
  perform recompute_can_display();
end $$;
