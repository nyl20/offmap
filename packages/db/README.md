# @offmap/db

Shared database-facing TypeScript for OFFMAP.

- `src/types.ts` — hand-written row types (`VenueRow`, `EventRow`, `EventWithVenueRow`)
  matching the live schema in `supabase/migrations`. No Supabase CLI project link
  exists yet for `supabase gen types typescript` — once one does, prefer generating
  these instead of hand-maintaining them.
- `src/queries.ts` — query functions (`getUpcomingEvents`, `getEventById`, `getVenues`,
  `getVenueById`, `getNearbyEvents`) that each take a `SupabaseClient` as a parameter
  rather than constructing one. Client lifecycle and env vars stay in the consuming
  app (`apps/web`); this package only owns query shape.

RLS already scopes reads correctly for the anon key (`venues`: all rows public;
`events`: only `can_display = true`), so these queries work unmodified from both
server- and browser-side Supabase clients.

Keep SQL migrations in the root `supabase/migrations` folder so Supabase CLI
workflows stay conventional.
