// One-time backfill: funnels whatever's already in the legacy SQLite
// database (data/events.db) into Supabase, through the same upsert_venue/
// insert_event RPCs the live scrapers use — so migrated rows get the same
// normalized_title/search_text/tags-array treatment as freshly scraped ones.
//
// Not part of the regular pipeline — run once (`npm run migrate-sqlite`)
// after the Supabase schema is in place, then rely on `npm run scrape` going
// forward. Safe to re-run: insert_event no-ops on a source_url it has
// already seen.
import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { getDb } from '../src/db/supabase.js';
import { upsertVenue, insertEvent, recomputeCanDisplay, recomputeDuplicateGroups } from '../src/db/funnel.js';

const dbPath = process.env.DB_PATH ?? './data/events.db';
const sqlite = new DatabaseSync(dbPath);
const db = getDb();

const venues = sqlite.prepare('SELECT * FROM venues').all();
const venuesById = new Map(venues.map(v => [v.id, v]));
const venueIdMap = new Map(); // sqlite venue id -> supabase venue id

console.log(`[migrate] migrating ${venues.length} venues…`);
for (const v of venues) {
  const supabaseId = await upsertVenue(db, {
    venue_name: v.name,
    venue_address: v.address,
    venue_lat: v.latitude,
    venue_lng: v.longitude,
    source_name: v.geocode_provider ?? 'migrated',
    venue_address_line: v.address_line,
    venue_city: v.city,
    venue_region: v.region,
    venue_postal: v.postal_code,
    venue_country: v.country,
    venue_opening_hours: v.venue_opening_hours,
  });

  // upsert_venue's "trusted scraper coords" path always stamps
  // confidence=1.0/provider=source_name on first insert. Overwrite with the
  // venue's real geocode metadata so migrated rows keep their true history.
  if (v.latitude != null && v.longitude != null) {
    const { error } = await db.from('venues').update({
      geocode_provider: v.geocode_provider,
      geocode_confidence: v.geocode_confidence,
      geocoded_at: v.geocoded_at,
      neighborhood: v.neighborhood,
    }).eq('id', supabaseId);
    if (error) console.error(`[migrate] venue ${v.id} metadata fixup failed: ${error.message}`);
  }

  venueIdMap.set(v.id, supabaseId);
}
console.log(`[migrate] ${venues.length} venues migrated`);

const events = sqlite.prepare('SELECT * FROM events').all();
let inserted = 0, skipped = 0;

console.log(`[migrate] migrating ${events.length} events…`);
for (const e of events) {
  const venueId = venueIdMap.get(e.venue_id);
  if (!venueId) { skipped++; continue; }

  const tags = e.tags ? JSON.parse(e.tags) : [];
  const venueName = venuesById.get(e.venue_id)?.name;

  try {
    const wasInserted = await insertEvent(db, venueId, {
      venue_name:        venueName,
      external_id:       e.external_id,
      title:             e.title,
      description:       e.description,
      category:          e.category,
      tags,
      start_time:        e.start_time,
      end_time:          e.end_time,
      timezone:          e.timezone,
      recurrence_rule:   e.recurrence_rule,
      price_text:        e.price_text,
      is_free:           e.is_free,
      age_restriction:   e.age_restriction,
      ticket_url:        e.ticket_url,
      organizer_name:    e.organizer_name,
      image_url:         e.image_url,
      image_source_url:  e.image_source_url,
      image_credit:      e.image_credit,
      image_license:     e.image_license,
      source_url:        e.source_url,
      source_name:       e.source_name,
      review_status:     e.review_status,
      confidence_score:  e.confidence_score,
      notes:             e.notes,
    }, e.source_fetched_at);

    if (wasInserted) inserted++; else skipped++;
  } catch (err) {
    console.error(`[migrate] event ${e.id} failed: ${err.message}`);
    skipped++;
  }
}

console.log(`[migrate] events: ${inserted} inserted, ${skipped} skipped`);

sqlite.close();

console.log('[migrate] recomputing can_display…');
console.log(`[migrate] can_display refreshed for ${await recomputeCanDisplay(db)} events`);

console.log('[migrate] recomputing duplicate groups…');
const dupes = await recomputeDuplicateGroups(db);
console.log(`[migrate] ${dupes.groupCount} duplicate groups (${dupes.eventCount} events) found`);
