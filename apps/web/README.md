# OFFMAP Web

The OFFMAP website — Next.js (App Router), reading live event/venue data
straight from Supabase (RLS already scopes anon reads correctly: all of
`venues`, and `events` where `can_display = true`).

Web-specific UI and routing live here. Shared types, category vocabulary,
design tokens, and query logic live in `@offmap/shared` / `@offmap/db`
(`packages/shared`, `packages/db`) so they aren't duplicated if `apps/mobile`
is ever wired up to live data too.

## Setup

```
cp .env.example .env.local
```

Fill in `.env.local` with:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same project
  as `offmap/data/ingestion/.env`'s `SUPABASE_URL`/`SUPABASE_ANON_KEY`
  (the anon key, **not** `SUPABASE_SERVICE_ROLE_KEY`).
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` — same as `data/ingestion/.env`'s
  `MAPBOX_TOKEN`.

Then from the repo root:

```
npm install
npm run web
```

## Scope notes

- No Supabase Auth yet — "Saved" is a client-only `localStorage` bookmark
  list (`src/lib/bookmarks.ts`), not persisted server-side.
- No API routes — Server Components query Supabase directly server-side;
  Client Components use a browser Supabase client for interactivity. Both
  call the same `@offmap/db` query functions.
- Photos use plain `<img>`, not `next/image` — event/venue images come from
  an unbounded set of scraped source domains, incompatible with
  `next/image`'s `remotePatterns` allowlist. Falls back to a category-tinted
  icon tile when `image_url` is null.
