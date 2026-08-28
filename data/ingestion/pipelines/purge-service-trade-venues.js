import 'dotenv/config';
import { getDb } from '../db/supabase.js';
import { findServiceTradeVenues, findSuspectCraftShopVenues, deleteVenues } from '../db/purge-service-trade-venues.js';

// Dry-run by default — pass --commit to actually delete. Review the printed
// list first; the keyword match is a heuristic, not a guarantee.
const commit = process.argv.includes('--commit');

const db = getDb();
const matches = await findServiceTradeVenues(db);

if (!matches.length) {
  console.log('No service-trade venues found.');
} else {
  console.log(`Found ${matches.length} venue(s) matching service-trade keywords:\n`);
  for (const v of matches) {
    console.log(`  [${v.id}] ${v.name} — ${v.address}`);
  }

  if (!commit) {
    console.log('\nDry run only — re-run with --commit to delete these.');
  } else {
    const { deleted, failed } = await deleteVenues(db, matches.map(v => v.id));
    console.log(`\nDeleted ${deleted} venue(s).`);
    if (failed.length) {
      console.log(`${failed.length} could not be deleted (likely still referenced by an event):`);
      for (const f of failed) console.log(`  [${f.id}] ${f.message}`);
    }
  }
}

// Report-only, never gated behind --commit: category-only signal is too weak
// to auto-delete on (see findSuspectCraftShopVenues doc comment).
const suspects = await findSuspectCraftShopVenues(db);
console.log(`\nSuspect craft/shop venues (report only — not deleted): ${suspects.length}`);
for (const v of suspects) {
  console.log(`  [${v.id}] ${v.name} — ${v.address} (${v.categories.join(', ')})`);
}
