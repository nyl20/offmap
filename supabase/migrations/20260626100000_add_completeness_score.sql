-- `events.completeness_score` rates how much complete/quality information an
-- event record has, on 0..1 (8 equally-weighted signals, count-true / 8):
--
--   title          non-empty
--   start_time     present
--   venue          geocoded (venues.location is not null) — NOT just "has a
--                  venue_id", since every event already has one by FK; the
--                  meaningful signal is whether that venue actually resolved
--                  to a real place
--   ticket_url     a distinct link from source_url — NOT just "is not null",
--                  since funnel.js already falls back ticket_url to
--                  source_url when no separate ticket link exists, so a bare
--                  not-null check would always be true
--   source_url     non-empty
--   categories     at least one (controlled-vocabulary tag — see classify.js)
--   tags           at least one
--   source_name    non-empty
--
-- Like can_display/duplicate_group_id, this can't be fully determined at
-- INSERT time — venue geocoding happens in a later pass once all scrapers
-- for a run have finished (runner.js) — so it's a recompute function (see
-- recompute_can_display/recompute_duplicate_groups in
-- 20260621000001_funnel_functions.sql) rather than something funnel.js
-- computes inline, and runner.js calls it once at the end of every
-- `npm run scrape` alongside those two.

alter table events add column completeness_score real not null default 0
  check (completeness_score between 0 and 1);

create index idx_events_completeness_score on events (completeness_score);

create function recompute_completeness_scores()
returns integer
language sql
as $$
  with updated as (
    update events e set completeness_score = (
      (case when coalesce(trim(e.title), '') <> '' then 1 else 0 end) +
      (case when e.start_time is not null then 1 else 0 end) +
      (case when v.location is not null then 1 else 0 end) +
      (case when e.ticket_url is not null and e.ticket_url <> e.source_url then 1 else 0 end) +
      (case when coalesce(trim(e.source_url), '') <> '' then 1 else 0 end) +
      (case when coalesce(array_length(e.categories, 1), 0) > 0 then 1 else 0 end) +
      (case when coalesce(array_length(e.tags, 1), 0) > 0 then 1 else 0 end) +
      (case when coalesce(trim(e.source_name), '') <> '' then 1 else 0 end)
    )::real / 8
    from venues v
    where v.id = e.venue_id
    returning e.id
  )
  select count(*)::integer from updated;
$$;

revoke execute on function recompute_completeness_scores from public;
grant execute on function recompute_completeness_scores to service_role;

-- Backfill existing rows immediately so this migration leaves the table in a
-- consistent state rather than requiring a separate one-off script run.
do $$ begin perform recompute_completeness_scores(); end $$;
