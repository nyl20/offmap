-- Make junk-venue detection durable against category-array mutation.
--
-- recompute_venue_can_display()'s junk exclusion (20260803000000,
-- 20260804000000) infers "is this a stale pre-allowlist-fix OSM row" purely
-- from the CURRENT shape of venues.categories/sub_categories: a single
-- generic 'Arts & Crafts'/'Shopping' category with no sub-category. That
-- signature only holds as long as categories stays a single-element array.
-- Three code paths union categories arrays and can silently grow it past
-- one element, which permanently and invisibly exempts a junk row from the
-- exclusion even though it never actually gained a real sub-category:
--
--   1. upsert_venue()'s ON CONFLICT clause (20260626000000) — fires on ANY
--      scraper (including event scrapers) upserting a venue whose
--      name+address normalizes to match an existing junk OSM row.
--   2. merge_venue_into() (20260710000000), used by both
--   3. merge_duplicate_venues() (exact-name/75m) and
--      merge_cross_name_duplicate_venues() (fuzzy/domain match,
--      20260802000000 / perf-fixed 20260829000000) — the latter's
--      substring-name + 75m-proximity branch is also a plausible
--      false-positive source in its own right.
--
-- This is why roofers/contractors keep reappearing despite four prior
-- fixes: local-spots.js's Overpass query is already tightened to a real
-- craft-studio allowlist, but any row that slipped in before that fix, or
-- whose category-shape signal got destroyed by one of the paths above, is
-- invisible to every prior fix.
--
-- Fix: decide junk status ONCE, from the raw per-call classification
-- (never from the accumulated, mutable array), store it as a sticky flag
-- that can only ever be set, never cleared automatically, and quarantine
-- flagged rows from every dedup path so they can no longer launder a clean
-- category via merge.

alter table venues add column is_source_suspect boolean not null default false;

create index idx_venues_is_source_suspect on venues (is_source_suspect) where is_source_suspect;

-- ---------------------------------------------------------- upsert_venue ---

-- Same signature as 20260626000000 — CREATE OR REPLACE keeps existing
-- grants. Adds is_source_suspect: computed on INSERT directly from this
-- call's own p_categories/p_sub_categories/p_geocode_provider (the raw
-- per-call classification, before any union happens), and on the ON
-- CONFLICT branch OR'd onto the existing value — sticky, monotonic, and
-- immune to a later call's categories being broader (a later call can only
-- ever add to the union, never prove the row wasn't originally junk).
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
  p_geocode_confidence real
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
    is_source_suspect
  ) values (
    p_name, p_address, p_address_line, p_city, p_region, p_postal_code, p_country,
    p_normalized_venue_name, p_venue_opening_hours, p_categories, p_sub_categories,
    v_location,
    case when v_location is not null then p_geocode_provider end,
    case when v_location is not null then p_geocode_confidence end,
    case when v_location is not null then now() end,
    v_is_suspect
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

-- ------------------------------------------------------------- dedup ---

-- Same signature as 20260710000000 — adds is_source_suspect propagation as
-- defense-in-depth. The primary defense is excluding suspect rows from
-- dedup candidate queries entirely (below), so this OR only matters for a
-- hypothetical future caller that bypasses those candidate filters.
create or replace function merge_venue_into(p_winner_id bigint, p_loser_id bigint)
returns void
language plpgsql
as $$
begin
  update events set venue_id = p_winner_id where venue_id = p_loser_id;

  update venues w set
    address_line       = coalesce(w.address_line, l.address_line),
    city                = coalesce(w.city, l.city),
    region              = coalesce(w.region, l.region),
    postal_code         = coalesce(w.postal_code, l.postal_code),
    neighborhood        = coalesce(w.neighborhood, l.neighborhood),
    venue_opening_hours = coalesce(w.venue_opening_hours, l.venue_opening_hours),
    description         = coalesce(w.description, l.description),
    phone               = coalesce(w.phone, l.phone),
    image_url           = coalesce(w.image_url, l.image_url),
    website_url         = coalesce(w.website_url, l.website_url),
    location            = coalesce(w.location, l.location),
    geocode_provider    = coalesce(w.geocode_provider, l.geocode_provider),
    geocode_confidence  = coalesce(w.geocode_confidence, l.geocode_confidence),
    geocoded_at         = coalesce(w.geocoded_at, l.geocoded_at),
    is_permanent        = w.is_permanent or l.is_permanent,
    is_source_suspect   = w.is_source_suspect or l.is_source_suspect,
    categories          = coalesce((select array_agg(distinct c) from unnest(w.categories || l.categories) c), '{}'),
    sub_categories      = coalesce((select array_agg(distinct c) from unnest(w.sub_categories || l.sub_categories) c), '{}')
  from venues l
  where w.id = p_winner_id and l.id = p_loser_id;

  delete from venues where id = p_loser_id;
end;
$$;

-- Same signature as 20260710000000 — the dedup candidate set now excludes
-- suspect rows entirely (not just from the union side of merge_venue_into),
-- so a flagged row can never absorb or be absorbed by another venue through
-- this pass. It stays quarantined until a human clears the flag.
create or replace function merge_duplicate_venues()
returns jsonb
language plpgsql
as $$
declare
  v_group_count integer := 0;
  v_merged_count integer := 0;
  r record;
  loser_id bigint;
begin
  create temporary table venue_dedup_candidates on commit drop as
  select id, normalized_venue_name, completeness_score,
         ST_ClusterDBSCAN(location::geometry, eps := 75, minpoints := 1)
           over (partition by normalized_venue_name) as cluster_id
  from venues
  where normalized_venue_name is not null
    and not is_source_suspect;

  for r in
    select normalized_venue_name, cluster_id,
           array_agg(id order by completeness_score desc, id asc) as ids
    from venue_dedup_candidates
    where cluster_id is not null
    group by normalized_venue_name, cluster_id
    having count(*) > 1
  loop
    v_group_count := v_group_count + 1;
    foreach loser_id in array r.ids[2:array_length(r.ids, 1)]
    loop
      perform merge_venue_into(r.ids[1], loser_id);
      v_merged_count := v_merged_count + 1;
    end loop;
  end loop;

  return jsonb_build_object('group_count', v_group_count, 'merged_count', v_merged_count);
end;
$$;

-- Same signature as 20260829000000. Two changes from that version:
--   1. Both branches now exclude suspect rows on either side of the pair.
--   2. Branch 2 (substring-name + 75m proximity, no domain corroboration)
--      is REMOVED from auto-merge entirely — it's a plausible independent
--      false-positive source (two differently-named nearby venues where one
--      name happens to contain the other), and once junk rows can no longer
--      hide behind it, there's no reason to keep taking that risk
--      automatically. It's absorbed into queue_low_confidence_venue_
--      duplicates() below instead, for human review — consistent with this
--      file's own stated philosophy ("under-merges rather than risks a bad
--      merge"). Domain-equality (Branch 1) stays auto-merge — a shared
--      website domain is a much stronger signal than name-substring
--      proximity.
create or replace function merge_cross_name_duplicate_venues()
returns jsonb
language plpgsql
as $$
declare
  v_merged_count integer := 0;
  r record;
begin
  create temporary table cross_name_pairs on commit drop as
    select
      case when v1.completeness_score >= v2.completeness_score then v1.id else v2.id end as winner_id,
      case when v1.completeness_score >= v2.completeness_score then v2.id else v1.id end as loser_id
    from venues v1
    join venues v2
      on v2.id > v1.id
      and venue_website_domain(v1.website_url) = venue_website_domain(v2.website_url)
      and venue_website_domain(v1.website_url) <> ''
    where v1.location is not null and v2.location is not null
      and not v1.is_source_suspect and not v2.is_source_suspect;

  for r in select distinct winner_id, loser_id from cross_name_pairs
  loop
    if exists (select 1 from venues where id = r.winner_id)
       and exists (select 1 from venues where id = r.loser_id) then
      perform merge_venue_into(r.winner_id, r.loser_id);
      v_merged_count := v_merged_count + 1;
    end if;
  end loop;

  return jsonb_build_object('merged_count', v_merged_count);
end;
$$;

-- Same signature as 20260802000000. Adds: suspect-row exclusion (both
-- sides), and a second candidate source — the substring-name + 75m-
-- proximity pattern removed from merge_cross_name_duplicate_venues()'s
-- auto-merge above now lands here instead, tagged with its own
-- match_reason so a reviewer can tell it apart from trigram similarity.
create or replace function queue_low_confidence_venue_duplicates()
returns integer
language plpgsql
as $$
declare
  v_queued integer;
begin
  insert into venue_duplicate_candidates (venue_id_a, venue_id_b, match_reason, similarity)
  select v1.id, v2.id, 'trigram_name_similarity',
         similarity(v1.normalized_venue_name, v2.normalized_venue_name)
  from venues v1
  join venues v2 on v2.id > v1.id
  where v1.location is not null and v2.location is not null
    and not v1.is_source_suspect and not v2.is_source_suspect
    and st_dwithin(v1.location, v2.location, 150)
    and similarity(v1.normalized_venue_name, v2.normalized_venue_name) between 0.5 and 0.85

  union all

  select v1.id, v2.id, 'substring_name_proximity', null
  from venues v1
  join venues v2 on v2.id > v1.id
  where v1.location is not null and v2.location is not null
    and not v1.is_source_suspect and not v2.is_source_suspect
    and st_dwithin(v1.location, v2.location, 75)
    and length(v1.normalized_venue_name) >= 4 and length(v2.normalized_venue_name) >= 4
    and (
      v2.normalized_venue_name like '%' || v1.normalized_venue_name || '%'
      or v1.normalized_venue_name like '%' || v2.normalized_venue_name || '%'
    )

  on conflict (least(venue_id_a, venue_id_b), greatest(venue_id_a, venue_id_b)) do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;

-- --------------------------------------------------- display gate ---

-- Same signature as 20260804000000. is_source_suspect is now the primary
-- exclusion — it's immune to the categories-array mutation that let the
-- old shape-derived check (`cardinality(categories)=1 and ...`) get
-- silently bypassed. That old check is kept ALONGSIDE it for one release as
-- a transitional safety net, in case the backfill below misses some edge
-- case; drop it in a follow-up migration once is_source_suspect has proven
-- itself in production. Explicit simplicity-vs-robustness tradeoff — not
-- dropped immediately.
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
      and not v.is_source_suspect
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

-- --------------------------------------------------------- backfill ---

-- One-time backfill of is_source_suspect for EXISTING rows. The shape
-- heuristic alone (part (a) below) can't see rows already contaminated to
-- cardinality > 1 by the mutation paths described at the top of this file —
-- that's the whole bug. Part (b), a name-keyword regex, catches those. This
-- regex must be kept in sync with TRADE_KEYWORDS in
-- offmap/data/ingestion/db/purge-service-trade-venues.js — it's used ONLY
-- for this one-time backfill; ongoing detection relies on the shape test
-- evaluated at ingestion time in upsert_venue() above, not on this regex.
-- Not scoped to geocode_provider = 'OpenStreetMap' — junk isn't proven
-- 100% OSM-exclusive.
update venues
set is_source_suspect = true
where not is_source_suspect
  and (
    (
      geocode_provider = 'OpenStreetMap'
      and cardinality(categories) = 1
      and categories && array['Arts & Crafts', 'Shopping']::text[]
      and coalesce(array_length(sub_categories, 1), 0) = 0
    )
    or name ~* (
      'plumb|hvac|heating|air condition|laundr|dry clean|shoe repair|cobbler|' ||
      'tailor|alteration|key cutting|locksmith|upholster|watch repair|' ||
      'ubreakifix|phone repair|cell phone repair|cellphone repair|' ||
      'computer repair|laptop repair|electronics repair|iphone repair|experimac|' ||
      'cleaning service|house cleaning|janitorial|maid service|' ||
      'roofing|roofer|landscap|fence|fencing|pest control|contractor|construction'
    )
  );

do $$ begin
  perform recompute_venue_can_display();
  perform recompute_can_display();
end $$;
