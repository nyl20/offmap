-- Manual review workflow for the generic-URL event source registry
-- (event_sources, see migrations/20260828000000_add_event_sources.sql).
-- recompute_source_health() only ever moves a source toward 'quiet' or
-- 'broken' automatically — promoting a freshly onboarded 'candidate' to
-- 'active', or moving anything to the terminal 'disabled' state, is always
-- a human decision. There's no admin UI yet, so this is run by hand in the
-- Supabase SQL Editor, same pattern as venue_dedup_review.sql.
--
-- Not part of the regular pipeline. Run periodically (e.g. after checking
-- scrape logs, or after running `node pipelines/onboard-source.js <url>`).

-- 1. Newly onboarded sources awaiting a decision:
select id, url, platform, detection_tier, last_error, last_error_reason_code, created_at
from event_sources
where status = 'candidate'
order by created_at desc;

-- 2. Looks good — promote it so the nightly genericurl scraper starts
--    checking it going forward:
--
-- update event_sources set status = 'active' where id = <source_id>;

-- 3. Sources currently flagged unhealthy, most recently checked first —
--    the thing "has this source gone quiet or broken" is meant to surface:
select id, url, platform, status, last_error_reason_code, last_error,
       last_event_seen_at, last_checked_at, consecutive_failure_count
from event_sources
where status in ('quiet', 'broken')
order by last_checked_at desc;

-- 4. A 'quiet' source really has just stopped posting (confirmed by hand,
--    e.g. checked the URL and it truly has nothing upcoming) — leave it as
--    'quiet' and it'll flip back to 'active' on its own once it lists
--    something new again (recompute_source_health() checks this every run).
--    No action needed; this row is here so the query above stays the one
--    place documenting that 'quiet' is expected to self-heal.

-- 5. A 'broken' source that's confirmed genuinely dead (site shut down,
--    permanently blocking, moved with no redirect) — disable it so it's
--    never attempted again. This is the one destructive, human-only step:
--
-- update event_sources
--   set status = 'disabled', disabled_at = now(), disabled_reason = '<why>'
--   where id = <source_id>;

-- 6. A 'broken' source that was actually a transient outage on our end (a
--    bad deploy, a temporary block that's since lifted) — reset it to try
--    again from a clean slate rather than staying excluded forever:
--
-- update event_sources
--   set status = 'active', consecutive_failure_count = 0, last_error = null, last_error_reason_code = null
--   where id = <source_id>;
