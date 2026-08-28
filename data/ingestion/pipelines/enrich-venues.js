import 'dotenv/config';
import { getDb } from '../db/supabase.js';
import { backfillAddressDetails } from '../geocoding/mapbox.js';
import { enrichVenuesFromWebsite } from '../db/enrich-venues.js';

if (process.env.MAPBOX_TOKEN) {
  const addr = await backfillAddressDetails();
  console.log(`Address backfill: ${addr.resolved} resolved, ${addr.failed} failed`);
} else {
  console.log('MAPBOX_TOKEN not set — skipping address backfill.');
}

const web = await enrichVenuesFromWebsite(getDb());
console.log(`Website enrichment: ${web.enriched} enriched, ${web.skipped} skipped`);
