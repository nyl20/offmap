import fetch from 'node-fetch';
import { splitUSAddress } from './utils.js';
import { enrichVenue } from './local-spots/enrichVenue.js';

// General-purpose permanent-venue scraper using OpenStreetMap's free Overpass
// API. Covers museums, galleries, thrift/vintage/book/record shops, community
// centres, arts centres, and craft studios within the NYC bounding box.
// Replaces the old osm_museums scraper and refreshes those records on each run.
export const name      = 'local-spots';
export const envKey    = null;
export const venueOnly = true;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NYC = { minLat: 40.477, minLng: -74.259, maxLat: 40.917, maxLng: -73.700 };

// Craft/shop are the two generic, overloaded category hints below — unlike
// museum/gallery/community, a bare "Craft" or "Shop" hint on its own can't
// distinguish a currently-allowlisted match (see buildQuery's tag list) from
// a stale row left over from before that allowlist existed (see
// db/purge-service-trade-venues.js's doc comment on the pre-fix bare
// craft=* bug). Recording the SPECIFIC OSM tag value as a sub-category, not
// just the collapsed top-level hint, gives every future ingestion a signal
// that survives independent of whether the venue happens to have a website
// or description — which the 20260803000000 migration then requires for
// exactly these two categories, so a row can only display as "Arts &
// Crafts"/"Shopping" if it was actually matched by name against a real
// allowlisted OSM tag, not just by having *some* content.
const CRAFT_SUBCATEGORY = {
  pottery: 'Pottery', jeweller: 'Jewelry Making', sculptor: 'Sculpture',
  printmaker: 'Printmaking', weaver: 'Weaving',
};
const SHOP_SUBCATEGORY = {
  second_hand: 'Second-Hand', charity: 'Charity Shop', vintage: 'Vintage',
  antiques: 'Antiques', books: 'Books', music: 'Music',
};

// Maps the OSM tag that matched each element to a category hint string that
// classify.js (via CATEGORY_ALIASES) resolves to the controlled vocabulary,
// plus — for craft/shop only — the specific sub-category (see comment above).
function getCategory(tags) {
  if (tags.tourism === 'museum')           return { category: 'Museum', subCategory: null };     // → Visual Arts & Museums
  if (tags.tourism === 'gallery')          return { category: 'Gallery', subCategory: null };     // → Visual Arts & Museums
  if (tags.amenity === 'arts_centre')      return { category: 'Art', subCategory: null };         // → Visual Arts & Museums
  if (tags.amenity === 'community_centre') return { category: 'Community', subCategory: null };   // → Community & Culture
  if (tags.craft)                          return { category: 'Craft', subCategory: CRAFT_SUBCATEGORY[tags.craft] ?? null }; // → Arts & Crafts
  if (tags.shop)                           return { category: 'Shop', subCategory: SHOP_SUBCATEGORY[tags.shop] ?? null };    // → Shopping
  return null;
}

function inNYC(lat, lng) {
  return lat >= NYC.minLat && lat <= NYC.maxLat && lng >= NYC.minLng && lng <= NYC.maxLng;
}

function buildQuery() {
  const bbox = `${NYC.minLat},${NYC.minLng},${NYC.maxLat},${NYC.maxLng}`;
  const tags = [
    '"tourism"="museum"', '"tourism"="gallery"',
    '"shop"="second_hand"', '"shop"="charity"',
    '"shop"="vintage"',    '"shop"="antiques"',
    '"shop"="books"',      '"shop"="music"',
    '"amenity"="community_centre"',
    '"amenity"="arts_centre"',
    // Explicit allowlist of art/craft *studio* subtypes — NOT a bare
    // `"craft"` filter. OSM's craft=* key also covers service/repair trades
    // (craft=dry_cleaning, craft=shoemaker, craft=tailor, craft=key_cutter,
    // etc.), which pulled dry cleaners and shoe repair shops in as "Arts &
    // Crafts" venues (they all collapsed to the same generic 'Craft' hint
    // in getCategory() below). Add more values here only if they're genuine
    // art/craft studios a visitor would seek out.
    '"craft"="pottery"', '"craft"="jeweller"', '"craft"="sculptor"',
    '"craft"="printmaker"', '"craft"="weaver"',
  ];
  const lines = tags.flatMap(t => [`node[${t}](${bbox});`, `way[${t}](${bbox});`]).join('\n      ');
  // 180s, not Overpass's more common 90s default — this query unions 15
  // node/way filters across all of NYC (1300+ elements), and a couple of
  // the shop=* filters alone (books, second_hand) are large enough on their
  // own that 90s risked a silent partial/truncated response under load.
  return `[out:json][timeout:180];\n    (\n      ${lines}\n    );\n    out center;`;
}

function extractAddress(tags) {
  const housenumber = tags['addr:housenumber'];
  const street      = tags['addr:street'];
  let line   = housenumber && street ? `${housenumber} ${street}` : (street ?? null);
  let city   = tags['addr:city']     ?? null;
  let region = tags['addr:state']    ?? null;
  let postal = tags['addr:postcode'] ?? null;

  if (!line && !city && tags['addr:full']) {
    const split = splitUSAddress(tags['addr:full']);
    line = split.line; city = split.city; region = split.region; postal = split.postal;
  }

  const cityRegion = region && postal ? `${region} ${postal}` : region;
  const full = [line, city, cityRegion].filter(Boolean).join(', ') || 'New York, NY';
  return { line, city, region, postal, full };
}

function normalizeVenue(el) {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;

  const lat = el.type === 'node' ? el.lat  : el.center?.lat;
  const lng = el.type === 'node' ? el.lon  : el.center?.lon;
  if (lat == null || lng == null || !inNYC(lat, lng)) return null;

  const { line, city, region, postal, full } = extractAddress(tags);
  const categoryInfo = getCategory(tags);

  return {
    venue_name:          name,
    venue_address:       full,
    venue_address_line:  line,
    venue_city:          city,
    venue_region:        region,
    venue_postal:        postal,
    venue_country:       'US',
    venue_lat:           lat,
    venue_lng:           lng,
    venue_opening_hours: tags.opening_hours ?? null,
    neighborhood:        tags['addr:suburb'] ?? tags['is_in:neighbourhood'] ?? null,
    category:            categoryInfo?.category ?? null,
    sub_category_hint:   categoryInfo?.subCategory ?? null,
    source_name:         'OpenStreetMap',
    website_url:         tags.website ?? tags['contact:website'] ?? null,
    phone:               tags.phone   ?? tags['contact:phone']   ?? null,
    description:         null,
    image_url:           null,
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchVenues() {
  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(buildQuery())}`,
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

  const { elements = [], remark } = await res.json();
  if (!elements.length) {
    console.warn('[local-spots] 0 elements returned — Overpass may be rate-limited');
  }
  // Overpass can return a truncated result set under load without an HTTP
  // error — it signals this via `remark` rather than failing outright, so a
  // silent partial response (e.g. the 5 large `shop=*` filters getting cut
  // off while the smaller `craft=*` filters came through fine — observed in
  // production) would otherwise look like a clean, complete run.
  if (remark) {
    console.warn(`[local-spots] Overpass remark (possible truncation): ${remark}`);
  }

  const venues = elements.map(normalizeVenue).filter(Boolean);
  console.log(`[local-spots] ${venues.length} venues from OSM; enriching those with websites…`);

  let enriched = 0;
  for (const venue of venues) {
    if (!venue.website_url) continue;
    await sleep(1500);
    const extra = await enrichVenue(venue.website_url, venue.venue_name);
    if (extra.description)   venue.description          = extra.description;
    if (extra.image_url)     venue.image_url            = extra.image_url;
    if (extra.phone)         venue.phone                = extra.phone;
    if (extra.opening_hours) venue.venue_opening_hours  = extra.opening_hours;
    enriched++;
  }

  console.log(`[local-spots] enriched ${enriched} venues from their websites`);
  return venues;
}
