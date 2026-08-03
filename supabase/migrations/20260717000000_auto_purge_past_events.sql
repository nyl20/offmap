-- Automatically deletes events once their start_time has passed, so stale
-- rows don't require the manual one-off cleanup in
-- supabase/reviews/bulk_actions.sql (DELETE FROM events WHERE start_time <
-- now();) to be re-run by hand.
--
-- pg_cron runs inside Postgres itself, independent of whether the ingestion
-- backend/runner.js is deployed or running, so this keeps the table clean
-- even if scraping stalls.

create extension if not exists pg_cron;

-- Supabase runs migrations as the `postgres` role, which owns the database
-- but isn't a true superuser — grant it explicit access to pg_cron's schema.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create function purge_past_events()
returns integer
language sql
as $$
  with deleted as (
    delete from events where start_time < now() returning id
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function purge_past_events from public;
grant execute on function purge_past_events to service_role;

-- cron.schedule() updates the existing job in place when a job with this
-- name already exists, so re-running this migration is safe.
select cron.schedule(
  'purge-past-events',
  '0 * * * *',  -- hourly, on the hour
  $$ select purge_past_events(); $$
);
