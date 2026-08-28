-- Cross-name venue deduplication.
--
-- merge_duplicate_venues() (20260710000000) only merges venues with an
-- IDENTICAL normalized_venue_name within 75m — it explicitly does not
-- attempt cross-name matching (e.g. "The Met" vs "Metropolitan Museum of
-- Art" vs a specific exhibit/wing scraped as its own venue, like "The Met -
-- Egyptian Wing"). That gap is exactly what's produced duplicate Met Museum
-- rows in the data: different scrapers (OSM, curated seed, Instagram
-- free-text venue-name extraction) name the same physical place differently,
-- and the curated-landmark aliasing in 20260626110000 only ever ran once, at
-- migration-apply time — it never catches venues created afterward.
--
-- This adds two passes, kept deliberately separate by confidence level per
-- the project's conservative-dedup stance (auto-merging wrong pairs is worse
-- than leaving a duplicate visible):
--
--   - merge_cross_name_duplicate_venues(): AUTO-MERGES only high-confidence
--     pairs — same website domain, or one normalized name contains the
--     other's AND they're within 75m. Reuses merge_venue_into() so the same
--     COALESCE-based field merge and completeness-based winner selection
--     applies as the exact-name pass.
--   - queue_low_confidence_venue_duplicates(): populates a review queue
--     using pg_trgm similarity in a band below auto-merge's near-exact
--     territory but above noise, for a human to confirm or reject via
--     supabase/reviews/venue_dedup_review.sql — there's no admin UI yet, so
--     this follows the same SQL-Editor-driven manual workflow already
--     established by supabase/reviews/bulk_actions.sql.

create extension if not exists pg_trgm;

create index idx_venues_normalized_venue_name_trgm
  on venues using gin (normalized_venue_name gin_trgm_ops);

-- ------------------------------------------------------------- queue ---

-- Pair-based rather than a venues.review_status column: a single venue row
-- isn't "under review" on its own, a *pair* is, and a venue can be a
-- candidate in several pairs at once (a hub venue name matching multiple
-- nearby near-duplicates).
create table venue_duplicate_candidates (
  id             bigint generated always as identity primary key,
  venue_id_a     bigint not null references venues(id) on delete cascade,
  venue_id_b     bigint not null references venues(id) on delete cascade,
  match_reason   text not null,
  similarity     real,
  status         text not null default 'pending'
                   check (status in ('pending', 'confirmed_merge', 'rejected')),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_note  text
);

-- A table-level `unique (...)` constraint only accepts plain column names,
-- not expressions — least()/greatest() need a unique index instead. This
-- also doubles as the target for the `on conflict` clause in
-- queue_low_confidence_venue_duplicates() below, which must reference the
-- same expressions.
create unique index idx_venue_dup_candidates_pair
  on venue_duplicate_candidates (least(venue_id_a, venue_id_b), greatest(venue_id_a, venue_id_b));

create index idx_venue_dup_candidates_status
  on venue_duplicate_candidates (status) where status = 'pending';

alter table venue_duplicate_candidates enable row level security;
-- No policies -> denied to anon/authenticated; backend/service_role only,
-- reviewed manually via the Supabase SQL Editor (service_role bypasses RLS).

-- --------------------------------------------------------- auto-merge ---

-- Strips scheme/www/path/query so 'https://www.moma.org/visit' and
-- 'http://moma.org' compare equal. Empty/null input returns '' so two
-- website-less venues never spuriously "match" on domain.
create function venue_website_domain(url text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(regexp_replace(coalesce(url, ''), '^https?://(www\.)?', ''), '/.*$', ''));
$$;

create function merge_cross_name_duplicate_venues()
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
  join venues v2 on v2.id > v1.id
  where
    v1.location is not null and v2.location is not null
    and (
      (
        venue_website_domain(v1.website_url) <> ''
        and venue_website_domain(v1.website_url) = venue_website_domain(v2.website_url)
      )
      or (
        st_dwithin(v1.location, v2.location, 75)
        and length(v1.normalized_venue_name) >= 4 and length(v2.normalized_venue_name) >= 4
        and (
          v2.normalized_venue_name like '%' || v1.normalized_venue_name || '%'
          or v1.normalized_venue_name like '%' || v2.normalized_venue_name || '%'
        )
      )
    );

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

-- ------------------------------------------------------ review queue ---

create function queue_low_confidence_venue_duplicates()
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
    and st_dwithin(v1.location, v2.location, 150)
    -- Lower bound excludes noise; upper bound excludes near-exact matches
    -- that merge_duplicate_venues/merge_cross_name_duplicate_venues would
    -- already have handled (identical name, or one containing the other).
    and similarity(v1.normalized_venue_name, v2.normalized_venue_name) between 0.5 and 0.85
  on conflict (least(venue_id_a, venue_id_b), greatest(venue_id_a, venue_id_b)) do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;

create view pending_venue_duplicate_review as
select
  c.id as candidate_id, c.match_reason, c.similarity, c.created_at,
  a.id as venue_a_id, a.name as venue_a_name, a.address as venue_a_address, a.website_url as venue_a_website,
  b.id as venue_b_id, b.name as venue_b_name, b.address as venue_b_address, b.website_url as venue_b_website
from venue_duplicate_candidates c
join venues a on a.id = c.venue_id_a
join venues b on b.id = c.venue_id_b
where c.status = 'pending'
order by c.similarity desc nulls last;

revoke execute on function merge_cross_name_duplicate_venues     from public;
revoke execute on function queue_low_confidence_venue_duplicates from public;

grant execute on function merge_cross_name_duplicate_venues     to service_role;
grant execute on function queue_low_confidence_venue_duplicates to service_role;
grant select on pending_venue_duplicate_review to service_role;

-- Backfill immediately so existing cross-name duplicates (Met Museum et al.)
-- are cleaned up as soon as this migration is applied, not just on the next
-- scrape. Order matters: auto-merge first, then queue — so the queue isn't
-- populated with pairs the auto-merge pass would have resolved anyway.
do $$ begin
  perform merge_cross_name_duplicate_venues();
  perform queue_low_confidence_venue_duplicates();
end $$;
