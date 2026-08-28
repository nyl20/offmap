import { getDb } from './supabase.js';
import { enrichVenue } from '../scrapers/local-spots/enrichVenue.js';
import { isGenericOsmCraftShopVenue } from './purge-service-trade-venues.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// enrichVenue() (scrapers/local-spots/enrichVenue.js) scrapes JSON-LD/OG tags
// off any website — it's already source-agnostic, but until now was only
// ever invoked inline during local-spots.js's own scrape. This reuses it as
// a standalone maintenance pass against any venue with a website_url and
// gaps in description/phone/hours/image, regardless of which scraper (or the
// curated-landmark seed) produced the row.
//
// 1500ms delay reuses local-spots.js's existing rate-limit for this exact
// concern — scraping arbitrary third-party venue websites, a much stricter
// budget than Mapbox's API (see geocoding/mapbox.js's 200ms default, a
// different service with a much higher rate limit). Keep these two rates
// distinct rather than collapsing them.
export async function enrichVenuesFromWebsite(db, { delayMs = 1500 } = {}) {
  const { data: candidates, error } = await db
    .from('venues')
    .select('id, name, website_url, description, phone, venue_opening_hours, image_url, geocode_provider, categories, sub_categories')
    .not('website_url', 'is', null)
    .or('description.is.null,phone.is.null,venue_opening_hours.is.null,image_url.is.null');
  if (error) throw new Error(`fetching enrichment-pending venues failed: ${error.message}`);

  // Skip presumptively-stale OSM craft/shop rows entirely — they can never
  // pass recompute_venue_can_display() (see migrations/
  // 20260803000000_tighten_venue_can_display.sql) regardless of what this
  // scrapes, so enriching them is pure waste, and risks pulling untrusted
  // content from an arbitrary (sometimes compromised) third-party website
  // into the database for a row that will still never display.
  const skippedSuspect = candidates.filter(isGenericOsmCraftShopVenue).length;
  const pending = candidates.filter(v => !isGenericOsmCraftShopVenue(v));
  if (skippedSuspect > 0) {
    console.log(`[enrich] skipping ${skippedSuspect} presumptively-stale OSM craft/shop venue(s) — can never pass the display gate`);
  }

  const summary = { enriched: 0, skipped: 0 };

  for (let i = 0; i < pending.length; i++) {
    const venue = pending[i];
    const extra = await enrichVenue(venue.website_url, venue.name);

    const patch = {};
    if (!venue.description && extra.description) patch.description = extra.description;
    if (!venue.phone && extra.phone) patch.phone = extra.phone;
    if (!venue.venue_opening_hours && extra.opening_hours) patch.venue_opening_hours = extra.opening_hours;
    if (!venue.image_url && extra.image_url) patch.image_url = extra.image_url;

    if (Object.keys(patch).length) {
      const { error: updateError } = await db.from('venues').update(patch).eq('id', venue.id);
      if (updateError) throw new Error(updateError.message);
      console.log(`[enrich] ✓ venue ${venue.id} "${venue.name}" → ${JSON.stringify(patch)}`);
      summary.enriched++;
    } else {
      summary.skipped++;
    }

    if (delayMs > 0 && i < pending.length - 1) await sleep(delayMs);
  }

  if (pending.length === 0) console.log('[enrich] No venues need website enrichment.');

  return summary;
}
