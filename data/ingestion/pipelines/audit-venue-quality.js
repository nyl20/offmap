import 'dotenv/config';
import { getDb } from '../db/supabase.js';
import {
  findIrrelevantNamedVenues,
  findVisitorCenterVenues,
  findGenericMunicipalFacilityVenues,
  findNeighborhoodPlaceholderVenues,
  findGenericSingleCategoryShopVenues,
  deleteVenues,
} from '../db/venue-quality.js';

// Dry-run by default — pass --commit to delete the high-confidence bucket
// (street segments, parking lots, veterans posts, playgrounds, virtual
// placeholders). The other buckets are report-only, always: they mix real
// destinations with junk and need a human to pick IDs, not a keyword match.
const commit = process.argv.includes('--commit');

function printVenue(v) {
  const cats = (v.categories ?? []).join(', ');
  const flag = v.can_display ? 'VISIBLE' : 'hidden';
  console.log(`  [${v.id}] ${v.name} — ${v.address} (${cats}) [${flag}]`);
}

const db = getDb();

const irrelevant = await findIrrelevantNamedVenues(db);
console.log(`\n=== Street segments / parking lots / veterans posts / playgrounds / virtual placeholders: ${irrelevant.length} ===`);
irrelevant.forEach(printVenue);
if (!commit) {
  console.log('\nDry run only — re-run with --commit to delete these.');
} else if (irrelevant.length) {
  const { deleted, failed } = await deleteVenues(db, irrelevant.map(v => v.id));
  console.log(`\nDeleted ${deleted} venue(s).`);
  if (failed.length) {
    console.log(`${failed.length} could not be deleted (likely still referenced by an event):`);
    for (const f of failed) console.log(`  [${f.id}] ${f.message}`);
  }
}

const visitorCenters = await findVisitorCenterVenues(db);
console.log(`\n=== Visitor centers (report only — review individually, some are real attractions): ${visitorCenters.length} ===`);
visitorCenters.forEach(printVenue);

const municipal = await findGenericMunicipalFacilityVenues(db);
console.log(`\n=== Generic community/rec/senior centers & pools (report only): ${municipal.length} ===`);
municipal.forEach(printVenue);

const neighborhoods = await findNeighborhoodPlaceholderVenues(db);
console.log(`\n=== Neighborhood-as-venue (report only): ${neighborhoods.length} ===`);
neighborhoods.forEach(printVenue);

const shops = await findGenericSingleCategoryShopVenues(db);
console.log(`\n=== Generic single-category OSM shops/craft studios (report only — mixes real destinations with junk, review by name): ${shops.length} ===`);
shops.forEach(printVenue);
