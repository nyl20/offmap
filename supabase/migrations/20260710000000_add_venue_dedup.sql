-- Venue deduplication.
--
-- upsert_venue's unique index (20260621000002) only catches exact-text
-- duplicates (same name+address after case/whitespace normalization). It
-- misses the same physical venue scraped with a differently-formatted
-- address (MoMA has at least 3 spellings across scrapers/moma.js, the
-- curated seed in 20260626110000, and OSM via local-spots.js), or an
-- Instagram post that free-generates a slightly different name/address for
-- a venue that's already in the table (scrapers/instagram/parseEvent.js has
-- no grounding against existing rows).
--
-- This adds a venues-level completeness score (same pattern as
-- events.completeness_score, 20260626100000) to decide which of two
-- duplicate rows is "more complete", plus a merge pass that finds rows with
-- an identical normalized_venue_name clustered within 75m of each other
-- (PostGIS ST_ClusterDBSCAN), keeps the most complete one, and folds the
-- rest into it. This intentionally does not attempt cross-name matching
-- (e.g. "MoMA" vs "Museum of Modern Art (MoMA)") — that needs fuzzy
-- name matching and carries a much higher false-positive risk, so it's out
-- of scope for this automatic pass.

-- ------------------------------------------------------- completeness ---

alter table venues add column completeness_score real not null default 0
  check (completeness_score between 0 and 1);

create index idx_venues_completeness_score on venues (completeness_score);

create function recompute_venue_completeness_scores()
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
    returning v.id
  )
  select count(*)::integer from updated;
$$;

-- ------------------------------------------------------------- merge ---

-- Folds p_loser_id into p_winner_id: repoints its events (venue_id is not
-- null with no cascade, so this must happen before the delete below),
-- coalesces scalar fields onto the winner (never overwrite an
-- already-set value — same rule upsert_venue already follows), unions the
-- array columns, then deletes the loser.
create function merge_venue_into(p_winner_id bigint, p_loser_id bigint)
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
    categories          = coalesce((select array_agg(distinct c) from unnest(w.categories || l.categories) c), '{}'),
    sub_categories      = coalesce((select array_agg(distinct c) from unnest(w.sub_categories || l.sub_categories) c), '{}')
  from venues l
  where w.id = p_winner_id and l.id = p_loser_id;

  delete from venues where id = p_loser_id;
end;
$$;

-- Finds duplicate clusters (identical normalized_venue_name, within 75m of
-- each other) and merges each cluster down to its most complete row.
-- Rows with a null location get a null cluster id from ST_ClusterDBSCAN and
-- are skipped — they can only already be exact-text duplicates, which the
-- unique index on (name, address) prevents at insert time.
create function merge_duplicate_venues()
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
  where normalized_venue_name is not null;

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

revoke execute on function recompute_venue_completeness_scores from public;
revoke execute on function merge_venue_into                     from public;
revoke execute on function merge_duplicate_venues                from public;

grant execute on function recompute_venue_completeness_scores to service_role;
grant execute on function merge_venue_into                     to service_role;
grant execute on function merge_duplicate_venues                to service_role;

-- Backfill immediately so existing duplicates (MoMA et al.) are cleaned up
-- as soon as this migration is applied, not just on the next scrape.
do $$ begin
  perform recompute_venue_completeness_scores();
  perform merge_duplicate_venues();
end $$;
