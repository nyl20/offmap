import { getDb } from './supabase.js';

// One-time cleanup for venues pulled in by local-spots.js before it switched
// from a bare `craft=*` Overpass filter to an explicit art/craft-studio
// allowlist (see scrapers/local-spots.js). The bare filter also matched OSM's
// craft=* service trades (dry cleaners, plumbers, HVAC, tailors, shoemakers,
// locksmiths, ...), which got upserted as permanent venues. runner.js only
// upserts, never deletes, so rows that no longer match the tightened query
// are stuck — this sweeps them out by name keyword instead, since the raw
// OSM craft= value itself was never stored (only a collapsed 'Craft' hint).
const TRADE_KEYWORDS = [
  'plumb', 'hvac', 'heating', 'air condition',
  'laundr', 'dry clean', 'shoe repair', 'cobbler',
  'tailor', 'alteration', 'key cutting', 'locksmith',
  'upholster', 'watch repair',
  // Phone/electronics repair chains — same pre-allowlist craft=* bug as the
  // trades above, but the original list had no electronics-repair terms so
  // these slipped through the first purge pass.
  'ubreakifix', 'phone repair', 'cell phone repair', 'cellphone repair',
  'computer repair', 'laptop repair', 'electronics repair', 'iphone repair',
  'experimac',
  // Generic cleaning services. Deliberately multi-word phrases, not a bare
  // 'clean', which would false-positive on legitimate venues/events with
  // "clean" in the name (e.g. "Clean Plates Food Festival").
  'cleaning service', 'house cleaning', 'janitorial', 'maid service',
];

const NAME_PATTERN = TRADE_KEYWORDS.join('|');
const PAGE_SIZE = 1000;

/**
 * True for the exact pattern recompute_venue_can_display() (migrations/
 * 20260803000000_tighten_venue_can_display.sql) excludes from display: an
 * OSM-sourced venue whose only category is the generic 'Arts & Crafts'/
 * 'Shopping' alias with no sub-category. Shared with db/enrich-venues.js —
 * these venues can never pass the display gate regardless of content, so
 * spending an enrichment pass scraping their (often irrelevant, sometimes
 * outright compromised — see migration comment) website is pure waste, and
 * risks pulling untrusted scraped content into the database for rows that
 * only look "almost complete" because of it.
 */
export function isGenericOsmCraftShopVenue(v) {
  return v.geocode_provider === 'OpenStreetMap'
    && Array.isArray(v.categories) && v.categories.length === 1
    && (v.categories[0] === 'Arts & Crafts' || v.categories[0] === 'Shopping')
    && (v.sub_categories?.length ?? 0) === 0;
}

/**
 * Finds venues that came from the OSM permanent-venue scraper and whose name
 * matches a service-trade keyword. Pure lookup — no writes. ilike can't do
 * regex alternation, so this filters client-side against the full OSM set
 * rather than trying to encode TRADE_KEYWORDS into one ilike pattern.
 */
export async function findServiceTradeVenues(db) {
  const rows = [];
  let from = 0;
  while (true) {
    // .order('id') is required for correctness, not just presentation —
    // without an explicit stable sort, PostgREST doesn't guarantee row
    // order is consistent across separate .range() calls, so paginating
    // without one can silently skip or repeat rows once the table exceeds
    // PAGE_SIZE (found in production: this scan came back empty on a table
    // with 2200+ OSM venues before this fix).
    const { data, error } = await db
      .from('venues')
      .select('id, name, address, categories')
      .eq('geocode_provider', 'OpenStreetMap')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`lookup failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const re = new RegExp(NAME_PATTERN, 'i');
  return rows.filter(v => re.test(v.name));
}

/**
 * Report-only — never deleted automatically. Finds OSM permanent-venue rows
 * whose only category is the generic 'Arts & Crafts'/'Shopping' alias (see
 * classify.js CATEGORY_ALIASES craft->'Arts & Crafts', shop->'Shopping')
 * with no sub-category, that the name-keyword pass above didn't already
 * catch.
 *
 * This used to also require website_url IS NULL, on the theory that a real
 * website made a row less likely to be junk. That assumption was wrong —
 * in production this exact pattern (single generic category, empty
 * sub_categories) matched real businesses with real websites (a watch
 * repair shop's own site, a pest control company's own site) just as often
 * as it matched genuine craft/shop venues, and having a website said
 * nothing about which. See migrations/20260803000000_tighten_venue_can_display.sql
 * for the actual fix: local-spots.js now tags every currently-allowlisted
 * OSM match with a SPECIFIC sub-category (Pottery, Books, Vintage, etc), so
 * a row landing here — after a fresh `npm run scrape:venues` run, which
 * would have backfilled that sub-category onto anything still legitimately
 * matched — is presumptively a stale pre-allowlist-fix row, not a current
 * false negative. That migration already hides these from public display
 * regardless of whether this script ever deletes them; this remains
 * report-only for actual deletion since "presumptively stale" still isn't
 * a certainty worth auto-purging on.
 */
export async function findSuspectCraftShopVenues(db) {
  const rows = [];
  let from = 0;
  while (true) {
    // See the matching comment in findServiceTradeVenues above — .order('id')
    // is required for pagination correctness, not just presentation.
    const { data, error } = await db
      .from('venues')
      .select('id, name, address, categories, sub_categories, website_url, geocode_provider')
      .eq('geocode_provider', 'OpenStreetMap')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`lookup failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const re = new RegExp(NAME_PATTERN, 'i');
  return rows.filter(v => !re.test(v.name) && isGenericOsmCraftShopVenue(v));
}

/**
 * Deletes the given venue ids. Any venue an event still references will fail
 * the FK constraint rather than being silently removed — surfaced as an
 * error per-row so the caller can see which ones need manual attention.
 */
export async function deleteVenues(db, ids) {
  const results = { deleted: 0, failed: [] };
  for (const id of ids) {
    const { error } = await db.from('venues').delete().eq('id', id);
    if (error) results.failed.push({ id, message: error.message });
    else results.deleted++;
  }
  return results;
}
