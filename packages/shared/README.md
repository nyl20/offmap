# @offmap/shared

Shared TypeScript-only code for OFFMAP apps.

- `src/categories.ts` — the 12-value category vocabulary (mirrors the DB CHECK
  constraint in `supabase/migrations/20260626000000_add_categories.sql`), plus
  per-category accent color + icon metadata driving chips/pins/tiles.
- `src/tokens.ts` — design tokens (`Colors`, `Palette`, `Fonts`, `Spacing`,
  `Radii`) for the website's dark-navy aesthetic, in the same `as const` shape
  as `apps/mobile/src/constants/theme.ts` (new values, not shared ones —
  mobile's theme is a separate light/dark cream palette).
- `src/types.ts` — UI-facing `OffmapEvent`/`OffmapVenue` types, adapted from
  `@offmap/db`'s row types via `toOffmapEvent()`/`toOffmapVenue()`.
- `src/format.ts` — `formatEventDateTime`, `formatPrice`, `formatVenueHours`,
  `buildDirectionsUrl` display helpers.
