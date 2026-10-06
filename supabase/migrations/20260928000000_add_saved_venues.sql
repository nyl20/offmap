-- Mirrors saved_events (20260621000000_init_schema.sql) for venues. The
-- existing localStorage-based "saves" feature lets users bookmark both
-- events and venues, but the schema only ever had a table for events —
-- this closes that gap before the real auth-backed saves feature replaces
-- the localStorage stand-in.

create table saved_venues (
  user_id     uuid not null references auth.users(id) on delete cascade,
  venue_id    bigint not null references venues(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, venue_id)
);

alter table saved_venues enable row level security;

create policy "Users manage own saved venues" on saved_venues
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
