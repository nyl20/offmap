import { getDb } from './supabase.js';
import { classify } from '../scrapers/classify.js';
import { normalizeTags } from '../scrapers/utils.js';

const PAGE_SIZE = 1000;
const UPDATE_CONCURRENCY = 25;

async function fetchAllRows(db, table, select) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await db.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`fetching ${table} failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// PostgREST .upsert() isn't usable here — events/venues both have several
// NOT NULL columns with no default (title, start_time, source_url, ...) and
// Postgres validates those on the INSERT branch of ON CONFLICT DO UPDATE
// before it ever checks for a conflict. Per-row .update() only touches the
// named columns, so it's the safe partial-write primitive.
async function updateRows(db, table, rows) {
  for (let i = 0; i < rows.length; i += UPDATE_CONCURRENCY) {
    const batch = rows.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(batch.map(({ id, categories, sub_categories }) =>
      db.from(table).update({ categories, sub_categories }).eq('id', id)
    ));
    const failed = results.find(r => r.error);
    if (failed) throw new Error(`updating ${table} failed: ${failed.error.message}`);
  }
}

/**
 * One-time backfill of `categories`/`sub_categories` for events and venues
 * created before the classification system existed (see scrapers/classify.js
 * and db/funnel.js). Mirrors what funnel.js does for new rows: classify()
 * per event from its own fields, classify() per venue from its name, and
 * union each event's result into the venue it belongs to — the same
 * accumulation upsert_venue performs live as new events arrive.
 *
 * Safe to re-run — classify() is a pure function, so reruns are idempotent.
 */
export async function backfillCategories() {
  const db = getDb();

  console.log('[backfill] fetching events…');
  const events = await fetchAllRows(db, 'events', 'id, venue_id, title, description, category, tags, venues(name)');
  console.log(`[backfill] ${events.length} events fetched`);

  console.log('[backfill] fetching venues…');
  const venues = await fetchAllRows(db, 'venues', 'id, name');
  console.log(`[backfill] ${venues.length} venues fetched`);

  const venueAcc = new Map(venues.map(v => [v.id, { categories: new Set(), subCategories: new Set() }]));

  // Seed each venue's accumulator with its own name — the only signal
  // venue-only scrapers (museums.js) ever supply.
  for (const venue of venues) {
    const { categories, subCategories } = classify({ venue_name: venue.name });
    const acc = venueAcc.get(venue.id);
    categories.forEach(c => acc.categories.add(c));
    subCategories.forEach(s => acc.subCategories.add(s));
  }

  const eventUpdates = events.map(event => {
    const tags = normalizeTags(event.tags);
    const result = classify({
      title: event.title,
      description: event.description,
      category: event.category,
      tags,
      venue_name: event.venues?.name,
    });

    const acc = venueAcc.get(event.venue_id);
    if (acc) {
      result.categories.forEach(c => acc.categories.add(c));
      result.subCategories.forEach(s => acc.subCategories.add(s));
    }

    return { id: event.id, categories: result.categories, sub_categories: result.subCategories };
  });

  console.log(`[backfill] writing categories for ${eventUpdates.length} events…`);
  await updateRows(db, 'events', eventUpdates);

  const venueUpdates = venues.map(v => {
    const acc = venueAcc.get(v.id);
    return { id: v.id, categories: [...acc.categories], sub_categories: [...acc.subCategories] };
  });

  console.log(`[backfill] writing categories for ${venueUpdates.length} venues…`);
  await updateRows(db, 'venues', venueUpdates);

  return { eventsUpdated: eventUpdates.length, venuesUpdated: venueUpdates.length };
}
