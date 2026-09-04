-- Fix merge_cross_name_duplicate_venues() timing out (20260802000000).
--
-- The original body self-joined the entire venues table (v2.id > v1.id, no
-- other join restriction) and put both real match conditions — website
-- domain equality, spatial proximity — inside a WHERE-level OR. That
-- structure prevents the planner from using either the GIST index on
-- location (idx_venues_location, 20260621000000) or a hash join on domain:
-- it falls back to a full nested loop over every pair. At the current
-- venues row count that's ~9 million pairs, each paying two regexp_replace
-- calls plus a spatial check plus two substring LIKEs — enough to blow the
-- statement timeout, and it only gets worse as venues grows.
--
-- Fix: split the OR into two UNION ALL branches, each with its real match
-- condition moved into JOIN ... ON instead of a WHERE-level OR, so the
-- planner can pick an efficient plan per branch (hash join for domain
-- equality, GIST-indexed nested loop for spatial proximity). Same function
-- name/signature/return shape as before, so db/funnel.js and
-- pipelines/runner.js need no changes.
create or replace function merge_cross_name_duplicate_venues()
returns jsonb
language plpgsql
as $$
declare
  v_merged_count integer := 0;
  r record;
begin
  create temporary table cross_name_pairs on commit drop as
    -- Branch 1: same website domain — a genuine equi-join, hash-joinable.
    select
      case when v1.completeness_score >= v2.completeness_score then v1.id else v2.id end as winner_id,
      case when v1.completeness_score >= v2.completeness_score then v2.id else v1.id end as loser_id
    from venues v1
    join venues v2
      on v2.id > v1.id
      and venue_website_domain(v1.website_url) = venue_website_domain(v2.website_url)
      and venue_website_domain(v1.website_url) <> ''
    where v1.location is not null and v2.location is not null

    union all

    -- Branch 2: spatial proximity — st_dwithin in the ON clause lets the
    -- planner drive this off idx_venues_location instead of scanning every
    -- pair in the table.
    select
      case when v1.completeness_score >= v2.completeness_score then v1.id else v2.id end as winner_id,
      case when v1.completeness_score >= v2.completeness_score then v2.id else v1.id end as loser_id
    from venues v1
    join venues v2
      on v2.id > v1.id
      and st_dwithin(v1.location, v2.location, 75)
    where v1.location is not null and v2.location is not null
      and length(v1.normalized_venue_name) >= 4 and length(v2.normalized_venue_name) >= 4
      and (
        v2.normalized_venue_name like '%' || v1.normalized_venue_name || '%'
        or v1.normalized_venue_name like '%' || v2.normalized_venue_name || '%'
      );

  -- UNION ALL, not UNION — the loop below already selects distinct pairs,
  -- so there's no need to pay for a second dedup pass building the temp table.

  -- Process pairs one at a time, re-checking existence each iteration: a
  -- transitive chain (A~B, B~C) can have its second pair reference a venue
  -- already deleted earlier in this same pass. That pair is skipped rather
  -- than resolved through the chain — under-merges rather than risks a bad
  -- merge, consistent with this project's dedup philosophy elsewhere. A
  -- skipped pair is re-evaluated fresh on the next scrape run.
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
