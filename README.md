# OFFMAP

OFFMAP is organized as a monorepo so the mobile app, future web app, shared
TypeScript code, ingestion jobs, and Supabase project files can evolve together.

## Layout

```txt
apps/
  mobile/          Expo app
  web/             Future Next.js web app

packages/
  shared/          Shared TypeScript types, constants, and pure utilities
  db/              Generated Supabase types and shared database helpers

data/
  ingestion/       Python scraping/API ingestion scripts

supabase/
  migrations/      Supabase SQL migrations
  functions/       Supabase Edge Functions
  seed.sql         Local seed data
```

## Mobile

Run the Expo app from the repo root:

```bash
npm run mobile
```

Or run commands directly in `apps/mobile`:

```bash
cd apps/mobile
npm run start
```

## Web

`apps/web` is currently a placeholder for the future Next.js app.

## Data

Ingestion scripts should live under `data/ingestion`. Keep generated database
types and shared database-facing TypeScript in `packages/db`, and keep SQL
migrations in `supabase/migrations`.
