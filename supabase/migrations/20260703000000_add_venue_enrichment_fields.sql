-- Add enrichment columns to venues, populated by website scraping in local-spots.js.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS phone       text,
  ADD COLUMN IF NOT EXISTS image_url   text;
