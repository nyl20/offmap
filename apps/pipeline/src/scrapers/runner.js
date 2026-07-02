import { getDb } from '../db/supabase.js';
import { upsertVenue, insertEvent, recomputeCanDisplay, recomputeDuplicateGroups, recomputeCompletenessScores } from '../db/funnel.js';
import { geocodePendingVenues, backfillNeighborhoods } from '../geocoding/mapbox.js';
import { isExcludedAudience } from './utils.js';
import * as reddit        from './reddit.js';
import * as bbg           from './bbg.js';
import * as moma          from './moma.js';
import * as timeout       from './timeout.js';
import * as theskint      from './theskint.js';
import * as untappedcities from './untappedcities.js';
import * as luma          from './luma.js';
import * as partiful      from './partiful.js';
import * as eventbrite      from './eventbrite.js';
import * as dice            from './dice.js';
import * as thrillist       from './thrillist.js';
import * as donyc           from './donyc.js';
import * as nycparks        from './nycparks.js';
import * as residentadvisor from './residentadvisor.js';
import * as nycopendata     from './nycopendata.js';
import * as brooklynmuseum  from './brooklynmuseum.js';
import * as met             from './met.js';
import * as museums         from './museums.js';
import * as instagram        from './instagram.js';

const SCRAPERS = [
  reddit, bbg, moma, timeout,
  theskint, untappedcities, luma, partiful,
  eventbrite, dice, thrillist,
  donyc, nycparks, residentadvisor, nycopendata,
  brooklynmuseum, met, museums,
  instagram,
];

async function logScrapeRunStart(db, sourceName) {
  const { data, error } = await db.from('scrape_runs').insert({ source_name: sourceName }).select('id').single();
  if (error) throw new Error(`logScrapeRunStart failed: ${error.message}`);
  return data.id;
}

async function logScrapeRunFinish(db, runId, { inserted, skipped, errorCount, errorMessage }) {
  const { error } = await db.from('scrape_runs').update({
    finished_at: new Date().toISOString(),
    inserted_count: inserted,
    skipped_count: skipped,
    error_count: errorCount,
    error_message: errorMessage ?? null,
  }).eq('id', runId);
  if (error) throw new Error(`logScrapeRunFinish failed: ${error.message}`);
}

export async function runScrapers({ skipGeocode = false, only = null } = {}) {
  const db        = getDb();
  const fetchedAt = new Date().toISOString();
  const totals    = { inserted: 0, skipped: 0, errors: 0 };
  const targets   = only ? SCRAPERS.filter(s => only.includes(s.name)) : SCRAPERS;

  for (const scraper of targets) {
    if (scraper.envKey && !process.env[scraper.envKey]) {
      console.log(`[runner] skipping ${scraper.name} — ${scraper.envKey} not set`);
      continue;
    }

    console.log(`\n[${scraper.name}] fetching…`);
    const runId = await logScrapeRunStart(db, scraper.name);

    // Venue-only scrapers (e.g. museums.js) supply permanent venue listings,
    // not time-bound events — upsertVenue only, never insertEvent.
    if (scraper.venueOnly) {
      let venues;
      try {
        venues = await scraper.fetchVenues();
      } catch (err) {
        console.error(`[${scraper.name}] failed: ${err.message}`);
        totals.errors++;
        await logScrapeRunFinish(db, runId, { inserted: 0, skipped: 0, errorCount: 1, errorMessage: err.message });
        continue;
      }

      console.log(`[${scraper.name}] ${venues.length} venues found`);
      const summary = { inserted: 0, skipped: 0, errors: 0 };

      for (const row of venues) {
        if (!row?.venue_name || !row.venue_address) {
          summary.skipped++;
          continue;
        }
        try {
          const venueId = await upsertVenue(db, row);
          // OSM already supplies a neighborhood for some venues — write it
          // directly (plain column update, same as backfillNeighborhoods)
          // rather than spending a Mapbox reverse-geocode call on it.
          if (row.neighborhood) {
            const { error: nbError } = await db.from('venues')
              .update({ neighborhood: row.neighborhood })
              .eq('id', venueId)
              .is('neighborhood', null);
            if (nbError) throw new Error(nbError.message);
          }
          summary.inserted++;
        } catch (rowErr) {
          summary.skipped++;
          summary.errors++;
          console.debug(`  [${scraper.name}] row skipped: ${rowErr.message}`);
        }
      }

      console.log(`[${scraper.name}] ✓ venues upserted=${summary.inserted} skipped=${summary.skipped}`);
      totals.inserted += summary.inserted;
      totals.skipped  += summary.skipped;
      totals.errors   += summary.errors;
      await logScrapeRunFinish(db, runId, {
        inserted: summary.inserted, skipped: summary.skipped, errorCount: summary.errors,
      });
      continue;
    }

    let rows;
    try {
      rows = await scraper.fetchEvents();
    } catch (err) {
      console.error(`[${scraper.name}] failed: ${err.message}`);
      totals.errors++;
      await logScrapeRunFinish(db, runId, { inserted: 0, skipped: 0, errorCount: 1, errorMessage: err.message });
      continue;
    }

    console.log(`[${scraper.name}] ${rows.length} events found`);
    if (!rows.length) {
      await logScrapeRunFinish(db, runId, { inserted: 0, skipped: 0, errorCount: 0 });
      continue;
    }

    const summary = { inserted: 0, skipped: 0, errors: 0 };
    let audienceExcluded = 0;

    for (const row of rows) {
      // Validate required fields before inserting
      if (!row?.title || !row.venue_name || !row.venue_address || !row.source_url || !row.start_time) {
        summary.skipped++;
        continue;
      }
      // Kids/senior/family-only events are dropped entirely, never inserted.
      if (isExcludedAudience(row.title, row.description)) {
        summary.skipped++;
        audienceExcluded++;
        continue;
      }
      // Already-past events are dropped entirely, never inserted.
      if (new Date(row.start_time) < new Date()) {
        summary.skipped++;
        continue;
      }
      try {
        const venueId = await upsertVenue(db, row);
        const inserted = await insertEvent(db, venueId, row, fetchedAt);
        if (inserted) summary.inserted++;
        else          summary.skipped++; // duplicate source_url
      } catch (rowErr) {
        summary.skipped++;
        summary.errors++;
        console.debug(`  [${scraper.name}] row skipped: ${rowErr.message}`);
      }
    }

    console.log(`[${scraper.name}] ✓ inserted=${summary.inserted} skipped=${summary.skipped}`
      + (audienceExcluded ? ` (of which ${audienceExcluded} excluded — kids/senior/family-only)` : ''));
    totals.inserted += summary.inserted;
    totals.skipped  += summary.skipped;
    totals.errors   += summary.errors;
    await logScrapeRunFinish(db, runId, {
      inserted: summary.inserted, skipped: summary.skipped, errorCount: summary.errors,
    });
  }

  // Geocode any venues the scrapers didn't supply coords for
  if (!skipGeocode && process.env.MAPBOX_TOKEN) {
    console.log('\n[geocoder] geocoding new venues without coordinates…');
    const geo = await geocodePendingVenues();
    console.log(`[geocoder] ${geo.resolved} resolved, ${geo.failed} failed`);

    console.log('\n[geocoder] backfilling neighborhoods for pre-geocoded venues…');
    const nb = await backfillNeighborhoods();
    console.log(`[geocoder] ${nb.resolved} neighborhoods resolved, ${nb.failed} failed`);
  }

  console.log('\n[runner] recomputing can_display…');
  const displayCount = await recomputeCanDisplay(db);
  console.log(`[runner] can_display refreshed for ${displayCount} events`);

  console.log('[runner] recomputing duplicate groups…');
  const dupes = await recomputeDuplicateGroups(db);
  console.log(`[runner] ${dupes.groupCount} duplicate groups (${dupes.eventCount} events) found`);

  console.log('[runner] recomputing completeness scores…');
  const scoredCount = await recomputeCompletenessScores(db);
  console.log(`[runner] completeness_score refreshed for ${scoredCount} events`);

  return totals;
}
