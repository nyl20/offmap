import { isIrrelevantVenueName } from '../scrapers/utils.js';

const PAGE_SIZE = 1000;

/**
 * Pages through the full venues table. Required — PostgREST doesn't
 * guarantee row order across separate .range() calls without an explicit
 * .order(), so paginating without one can silently skip or repeat rows once
 * the table exceeds PAGE_SIZE (see the same note in
 * purge-service-trade-venues.js, which hit this in production).
 */
async function fetchAllVenues(db, columns) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from('venues')
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`lookup failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

const BASE_COLUMNS = 'id, name, address, neighborhood, categories, sub_categories, is_permanent, geocode_provider, can_display';

/**
 * Venues matching the same structural patterns isIrrelevantVenueName()
 * blocks at ingestion time (street segments, parking lots, veterans posts,
 * playgrounds, virtual placeholders) — these already got past the gate
 * before it existed, or came in before this filter was added. Near-zero
 * false-positive risk; safe to bulk-delete after a glance at the list.
 */
export async function findIrrelevantNamedVenues(db) {
  const rows = await fetchAllVenues(db, BASE_COLUMNS);
  return rows.filter(v => isIrrelevantVenueName(v.name));
}

const VISITOR_CENTER_RE = /\bvis[ti]tors?('s)? cent(er|re)\b/i;

/**
 * Report-only — never auto-deleted. A "visitor center" can be a generic
 * park-entrance marker (junk) or a notable attraction in its own right
 * (e.g. a National Monument visitor center that's itself a museum) — the
 * name alone can't tell those apart, so this needs a human per-row call.
 */
export async function findVisitorCenterVenues(db) {
  const rows = await fetchAllVenues(db, BASE_COLUMNS);
  return rows.filter(v => VISITOR_CENTER_RE.test(v.name ?? ''));
}

const GENERIC_MUNICIPAL_RE = /\b(community cent(er|re)|rec(reation)? cent(er|re)|senior cent(er|re)|pool)\b/i;

/**
 * Report-only — never auto-deleted. Pools and community/rec/senior centers
 * are excluded from the hard-block list in isIrrelevantVenueName() on
 * purpose: "Union Pool" is a real live-music venue, and "NYC LGBT Community
 * Center" hosts real public programming. Reviewing by name + can_display
 * (already-visible rows are the ones worth looking at first) is safer than
 * a blanket keyword ban that would also block the next legitimately
 * interesting one of these from ever being ingested.
 */
export async function findGenericMunicipalFacilityVenues(db) {
  const rows = await fetchAllVenues(db, BASE_COLUMNS);
  return rows.filter(v => !isIrrelevantVenueName(v.name) && GENERIC_MUNICIPAL_RE.test(v.name ?? ''));
}

/**
 * Report-only — never auto-deleted. True when a venue's name is exactly its
 * own neighborhood (e.g. "Yorkville", "SoHo") — a neighborhood being used
 * as a stand-in venue rather than an actual place. High false-positive
 * risk: some of these (Governors Island, Bushwick) are already
 * can_display=true, suggesting a prior deliberate call to keep them as
 * loose area pins rather than real venues — needs a human decision per row,
 * not an automatic rule.
 */
export async function findNeighborhoodPlaceholderVenues(db) {
  const rows = await fetchAllVenues(db, BASE_COLUMNS);
  return rows.filter(v => v.neighborhood
    && v.name?.trim().toLowerCase() === v.neighborhood.trim().toLowerCase());
}

/**
 * Report-only — never auto-deleted. OSM-sourced venues whose only category
 * is the generic 'Arts & Crafts'/'Shopping' alias — the broadest cut of
 * db/purge-service-trade-venues.js's isGenericOsmCraftShopVenue(), without
 * requiring an empty sub_categories array. This bucket mixes genuine
 * destination businesses (Strand Bookstore, Housing Works Bookstore Cafe,
 * Books Are Magic — all of which plausibly host real events) with
 * anonymous thrift/record/jewelry shops with no event-hosting history —
 * the name alone can't separate them, so this is report-only by design;
 * do not bulk-delete from this list without reviewing each name.
 */
export async function findGenericSingleCategoryShopVenues(db) {
  const rows = await fetchAllVenues(db, 'id, name, address, neighborhood, categories, sub_categories, website_url, geocode_provider, can_display');
  return rows.filter(v =>
    v.geocode_provider === 'OpenStreetMap'
    && Array.isArray(v.categories) && v.categories.length === 1
    && (v.categories[0] === 'Arts & Crafts' || v.categories[0] === 'Shopping'));
}

export { deleteVenues } from './purge-service-trade-venues.js';
