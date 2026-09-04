import { getDb } from '../db/supabase.js';
import { upsertVenue, insertEvent, classifyRow, purgePastEvents, recomputeCanDisplay, recomputeDuplicateGroups, recomputeCompletenessScores, recomputeVenueCompletenessScores, mergeDuplicateVenues, recomputeVenueCanDisplay, mergeCrossNameDuplicateVenues, queueLowConfidenceVenueDuplicates } from '../db/funnel.js';
import { geocodePendingVenues, backfillNeighborhoods, backfillAddressDetails } from '../geocoding/mapbox.js';
import { enrichVenuesFromWebsite } from '../db/enrich-venues.js';
import { isExcludedAudience } from '../scrapers/utils.js';
import * as reddit        from '../scrapers/reddit.js';
import * as bbg           from '../scrapers/bbg.js';
import * as moma          from '../scrapers/moma.js';
import * as timeout       from '../scrapers/timeout.js';
import * as theskint      from '../scrapers/theskint.js';
import * as untappedcities from '../scrapers/untappedcities.js';
import * as luma          from '../scrapers/luma.js';
import * as partiful      from '../scrapers/partiful.js';
import * as eventbrite      from '../scrapers/eventbrite.js';
import * as dice            from '../scrapers/dice.js';
import * as thrillist       from '../scrapers/thrillist.js';
import * as donyc           from '../scrapers/donyc.js';
import * as nycparks        from '../scrapers/nycparks.js';
import * as residentadvisor from '../scrapers/residentadvisor.js';
import * as nycopendata     from '../scrapers/nycopendata.js';
import * as brooklynmuseum  from '../scrapers/brooklynmuseum.js';
import * as met             from '../scrapers/met.js';
import * as museums         from '../scrapers/museums.js';
import * as localSpots      from '../scrapers/local-spots.js';
import * as genericurl        from '../scrapers/genericurl/index.js';

// instagram — paused, deliberately NOT imported here (previously an
// unconditional `import * as instagram from '../scrapers/instagram.js'`
// stayed in this file even while unregistered below, and its transitive
// top-level code path — Groq client construction in
// scrapers/instagram/parseEvent.js — crashed this entire pipeline before
// GROQ_API_KEY was set, taking recomputeVenueCanDisplay and every other
// tail stage down with it; see logs/scrape.log 2026-08-29). Code is intact
// and functional (Apify fetch → Groq structured extraction on captions); to
// resume, add back `import * as instagram from '../scrapers/instagram.js';`
// above AND `instagram` to the array below, and set GROQ_API_KEY in .env.
const SCRAPERS = [
  reddit, bbg, moma, timeout,
  theskint, untappedcities, luma, partiful,
  eventbrite, dice, thrillist,
  donyc, nycparks, residentadvisor, nycopendata,
  brooklynmuseum, met, museums,
  localSpots,
  genericurl,
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

// Isolates one post-scrape maintenance stage so a failure in it (network
// blip, statement timeout — merge_cross_name_duplicate_venues has already
// timed out in production) can't abort the stages after it. Before this,
// the whole tail of runScrapers ran with no error isolation at all, so any
// one stage failing meant recomputeVenueCanDisplay — the function that
// actually enforces the junk-venue display gate — silently never ran; see
// logs/scrape.log for a 10-day streak of runs that never reached it.
async function runStage(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[runner] stage "${label}" failed: ${err.message}`);
    return null;
  }
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

          // Mark all venueOnly scraper results as permanent establishments and
          // write any enrichment fields the scraper supplied (website, description,
          // image, phone). Always overwrites so re-runs refresh stale data.
          const extra = { is_permanent: true };
          if (row.website_url) extra.website_url = row.website_url;
          if (row.description) extra.description = row.description;
          if (row.image_url)   extra.image_url   = row.image_url;
          if (row.phone)       extra.phone        = row.phone;
          const { error: extraErr } = await db.from('venues').update(extra).eq('id', venueId);
          if (extraErr) throw new Error(extraErr.message);

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
        const classification = classifyRow(row);
        const venueId = await upsertVenue(db, row, classification);
        const inserted = await insertEvent(db, venueId, row, fetchedAt, classification);
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

  // Belt-and-suspenders: the `purge-past-events` pg_cron job (see
  // offmap/supabase/migrations) already deletes events on an hourly
  // schedule regardless of whether scraping runs, but purge here too in
  // case pg_cron isn't enabled on this Supabase project.
  console.log('\n[runner] purging past events…');
  const purgedCount = await purgePastEvents(db);
  console.log(`[runner] purged ${purgedCount} past events`);

  // Geocode any venues the scrapers didn't supply coords for
  if (!skipGeocode && process.env.MAPBOX_TOKEN) {
    console.log('\n[geocoder] geocoding new venues without coordinates…');
    const geo = await geocodePendingVenues();
    console.log(`[geocoder] ${geo.resolved} resolved, ${geo.failed} failed`);

    console.log('\n[geocoder] backfilling neighborhoods for pre-geocoded venues…');
    const nb = await backfillNeighborhoods();
    console.log(`[geocoder] ${nb.resolved} neighborhoods resolved, ${nb.failed} failed`);

    console.log('\n[enrich] backfilling address details for geocoded venues…');
    const addrResult = await backfillAddressDetails();
    console.log(`[enrich] ${addrResult.resolved} resolved, ${addrResult.failed} failed`);
  }

  // Outside the skipGeocode guard — this is pure website scraping, no
  // Mapbox call — so --skip-geocode runs (e.g. scrape:instagram) still get it.
  console.log('\n[enrich] enriching venues from their websites…');
  const webResult = await enrichVenuesFromWebsite(db);
  console.log(`[enrich] ${webResult.enriched} enriched, ${webResult.skipped} skipped`);

  // Every stage below is wrapped with runStage: none of these are allowed
  // to abort the ones after it. Previously this whole tail ran unguarded,
  // so one stage timing out or hitting a network error (both have happened
  // in production — see runStage's doc comment) silently skipped
  // recomputeVenueCanDisplay entirely, which is the one function that
  // actually enforces the junk-venue display gate.
  console.log('\n[runner] recomputing venue completeness scores…');
  await runStage('recomputeVenueCompletenessScores', () => recomputeVenueCompletenessScores(db));

  // Run the display-gate recompute here too, BEFORE the merge/dedup block —
  // not just after. is_source_suspect (unlike the old category-shape check
  // it replaces) isn't defeated by the category-array unions merges
  // perform, so it's safe to apply early; this guarantees at least one
  // successful application of the gate even if mergeCrossNameDuplicateVenues
  // times out below, which has happened in production.
  console.log('[runner] recomputing venue can_display (pre-merge)…');
  const preMergeDisplayCount = await runStage('recomputeVenueCanDisplay (pre-merge)', () => recomputeVenueCanDisplay(db));
  if (preMergeDisplayCount != null) console.log(`[runner] can_display refreshed for ${preMergeDisplayCount} venues`);

  console.log('[runner] merging duplicate venues…');
  const venueMerge = await runStage('mergeDuplicateVenues', () => mergeDuplicateVenues(db));
  if (venueMerge) console.log(`[runner] merged ${venueMerge.mergedCount} venues across ${venueMerge.groupCount} duplicate groups`);

  console.log('[runner] merging cross-name duplicate venues…');
  const crossMerge = await runStage('mergeCrossNameDuplicateVenues', () => mergeCrossNameDuplicateVenues(db));
  if (crossMerge) console.log(`[runner] merged ${crossMerge.mergedCount} cross-name duplicates`);

  console.log('[runner] queuing low-confidence duplicate candidates…');
  const queuedCount = await runStage('queueLowConfidenceVenueDuplicates', () => queueLowConfidenceVenueDuplicates(db));
  if (queuedCount != null) console.log(`[runner] ${queuedCount} new candidate pair(s) queued for review`);

  console.log('[runner] recomputing venue completeness scores (post-merge)…');
  await runStage('recomputeVenueCompletenessScores (post-merge)', () => recomputeVenueCompletenessScores(db));

  console.log('[runner] recomputing venue can_display (post-merge)…');
  const venueDisplayCount = await runStage('recomputeVenueCanDisplay (post-merge)', () => recomputeVenueCanDisplay(db));
  if (venueDisplayCount != null) console.log(`[runner] can_display refreshed for ${venueDisplayCount} venues`);

  console.log('\n[runner] recomputing can_display…');
  const displayCount = await runStage('recomputeCanDisplay', () => recomputeCanDisplay(db));
  if (displayCount != null) console.log(`[runner] can_display refreshed for ${displayCount} events`);

  console.log('[runner] recomputing duplicate groups…');
  const dupes = await runStage('recomputeDuplicateGroups', () => recomputeDuplicateGroups(db));
  if (dupes) console.log(`[runner] ${dupes.groupCount} duplicate groups (${dupes.eventCount} events) found`);

  console.log('[runner] recomputing completeness scores…');
  const scoredCount = await runStage('recomputeCompletenessScores', () => recomputeCompletenessScores(db));
  if (scoredCount != null) console.log(`[runner] completeness_score refreshed for ${scoredCount} events`);

  return totals;
}
