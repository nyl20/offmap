# @offmap/db

Shared database-facing TypeScript for OFFMAP.

Good candidates:
- Generated Supabase TypeScript types
- Shared query result types
- Database constants that both apps need

Keep SQL migrations in the root `supabase/migrations` folder so Supabase CLI
workflows stay conventional.
