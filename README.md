# OFFMAP

OFFMAP is organized as a monorepo so the mobile app, web app, shared
TypeScript code, ingestion jobs, and Supabase project files can evolve together.

## Layout

```txt
apps/
  mobile/          Expo app
  web/             Next.js web app

packages/
  shared/          Shared TypeScript types, constants, and pure utilities
  db/              Shared database types and Supabase query helpers

data/
  ingestion/       Node.js scraping/API ingestion pipeline

supabase/
  migrations/      Supabase SQL migrations
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

Run the Next.js app from `apps/web`:

```bash
cd apps/web
npm run dev
```

## Data

Ingestion scripts should live under `data/ingestion`. Keep generated database
types and shared database-facing TypeScript in `packages/db`, and keep SQL
migrations in `supabase/migrations`.
