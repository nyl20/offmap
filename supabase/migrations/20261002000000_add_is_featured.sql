-- Manual "pin to top" flag for events and venues.
--
-- Unlike can_display (derived by recompute_can_display/recompute_venue_can_display),
-- is_featured is never set by scraper/ingestion code — it's flipped by hand
-- (Studio/SQL) the same way is_permanent is, and simply promotes a row to the
-- front of its category's listing on the web/app.

alter table events add column is_featured boolean not null default false;
alter table venues add column is_featured boolean not null default false;

create index idx_events_is_featured on events (is_featured) where is_featured;
create index idx_venues_is_featured on venues (is_featured) where is_featured;
