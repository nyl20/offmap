-- event_sources: registry of arbitrary venue-website URLs the genericurl
-- scraper (data/ingestion/scrapers/genericurl/) checks on a recurring
-- schedule, plus their health/freshness state.
--
-- Distinct from `venues` because a source is a *scrape target* (a URL plus
-- a render/detection strategy), not a physical place — a source can be
-- onboarded before it's ever linked to a geocoded venue. Distinct from
-- `scrape_runs`, which logs one row per named scraper per nightly run and
-- is purely write-only observability today — this table tracks one row per
-- URL, persisted across runs, and is the first thing in this schema that
-- actually reads `last_verified_at`-style freshness signals back out to
-- decide anything.
--
-- status lifecycle (see recompute_source_health() below):
--   candidate -> active    : MANUAL ONLY — a human promotes a freshly
--                            onboarded source (pipelines/onboard-source.js)
--                            after reviewing its first extraction
--   active    -> quiet     : automatic — no new/future event seen in 45 days
--   quiet     -> active    : automatic — a new/future event seen again
--   * -> broken            : automatic — 5 consecutive hard failures
--   * -> disabled          : MANUAL ONLY (supabase/reviews/event_sources_review.sql)
--
-- Only 'active' and 'quiet' sources are ever re-checked by the scraper —
-- 'broken'/'disabled' sources are excluded entirely (not even a plain
-- fetch), matching this schema's existing pattern of auto-flagging
-- conservatively and requiring a human for the destructive/final step (see
-- venue_duplicate_candidates in 20260802000000_add_venue_cross_name_dedup.sql).

create table event_sources (
  id                        bigint generated always as identity primary key,
  venue_id                  bigint references venues(id) on delete set null,
  url                       text not null unique,
  status                    text not null default 'candidate'
                              check (status in ('candidate', 'active', 'quiet', 'broken', 'disabled')),
  platform                  text,                      -- adapter that matched: 'luma' | 'eventbrite' | 'partiful' | 'webflow' | null (generic)
  detection_tier            text
                              check (detection_tier in ('jsonld', 'microdata', 'embedded_state', 'platform_adapter', 'llm_small', 'llm_large', 'none')),
  render_mode               text not null default 'http'
                              check (render_mode in ('http', 'shadow_api', 'headless')),
  last_checked_at           timestamptz,               -- every attempt, success or failure
  last_success_at           timestamptz,               -- last attempt that produced >=1 valid row
  last_event_seen_at        timestamptz,               -- max start_time across every row this source has ever produced;
                                                         -- a recurring listing keeps re-advancing this, so it only goes
                                                         -- stale once the source genuinely stops listing anything upcoming
  last_content_hash         text,                      -- see contentHash.js — unchanged hash skips re-detection/extraction
  consecutive_failure_count integer not null default 0,
  last_error                text,
  last_error_reason_code    text,                      -- blocked | not_found | no_signal | extraction_empty |
                                                         -- render_unsupported | low_confidence | llm_budget_exhausted
  created_at                timestamptz not null default now(),
  disabled_at               timestamptz,
  disabled_reason           text
);

create index idx_event_sources_status on event_sources (status);

-- RLS enabled, no policies — backend-only, same idiom as scrape_runs. This
-- registry never needs to be readable by the anon/public client.
alter table event_sources enable row level security;

-- Automatic, conservative status transitions only. Never writes 'disabled'
-- or promotes 'candidate' to 'active' — both are manual (see header above).
create function recompute_source_health()
returns integer
language sql
as $$
  with updated as (
    update event_sources s set status = (
      case
        when s.status in ('candidate', 'active', 'quiet') and s.consecutive_failure_count >= 5
          then 'broken'
        when s.status = 'active'
             and (s.last_event_seen_at is null or s.last_event_seen_at < now() - interval '45 days')
          then 'quiet'
        when s.status = 'quiet' and s.last_event_seen_at >= now() - interval '45 days'
          then 'active'
        else s.status
      end
    )
    where s.status in ('candidate', 'active', 'quiet')
    returning s.id
  )
  select count(*)::integer from updated;
$$;

revoke execute on function recompute_source_health from public;
grant execute on function recompute_source_health to service_role;
