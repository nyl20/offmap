import { splitUSAddress } from './utils.js';

// Permanent venue listings (museums/galleries), not time-bound events — this
// scraper supplies fetchVenues() instead of fetchEvents() and is run through
// the venue-only path in runner.js (upsertVenue only, no insertEvent).
export const name       = 'osm_museums';
export const envKey     = null;
export const venueOnly  = true;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// NYC bounding box, south/west/north/east order for Overpass's (lat,lng) bbox filter.
const NYC = { minLat: 40.477, minLng: -74.259, maxLat: 40.917, maxLng: -73.700 };

function inNYC(lat, lng) {
  return lat >= NYC.minLat && lat <= NYC.maxLat && lng >= NYC.minLng && lng <= NYC.maxLng;
}

function buildQuery() {
  const bbox = `${NYC.minLat},${NYC.minLng},${NYC.maxLat},${NYC.maxLng}`;
  return `
    [out:json][timeout:60];
    (
      node["tourism"="museum"](${bbox});
      way["tourism"="museum"](${bbox});
      node["tourism"="gallery"](${bbox});
      way["tourism"="gallery"](${bbox});
    );
    out center;
  `;
}

// OSM usually gives split address tags (addr:housenumber/addr:street/addr:city/
// addr:state/addr:postcode). A few nodes only have a single combined string
// (addr:full) instead — splitUSAddress() is the fallback for those.
function extractAddress(tags) {
  const housenumber = tags['addr:housenumber'];
  const street       = tags['addr:street'];

  let line   = housenumber && street ? `${housenumber} ${street}` : (street ?? null);
  let city   = tags['addr:city']  ?? null;
  let region = tags['addr:state'] ?? null;
  let postal = tags['addr:postcode'] ?? null;

  if (!line && !city && tags['addr:full']) {
    const split = splitUSAddress(tags['addr:full']);
    line = split.line; city = split.city; region = split.region; postal = split.postal;
  }

  // Don't fabricate a city/region — the rectangular bbox overlaps a sliver of
  // NJ (Hoboken, Fort Lee), so defaulting to "New York" would mislabel those.
  // Join whatever OSM actually gave us; upsertVenue's splitUSAddress fallback
  // will try the combined string for anything still missing.
  const cityRegion = region && postal ? `${region} ${postal}` : region;
  const full = [line, city, cityRegion].filter(Boolean).join(', ') || 'New York, NY';

  return { line, city, region, postal, full };
}

function normalizeVenue(el) {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;

  const lat = el.type === 'node' ? el.lat : el.center?.lat;
  const lng = el.type === 'node' ? el.lon : el.center?.lon;
  if (lat == null || lng == null || !inNYC(lat, lng)) return null;

  const { line, city, region, postal, full } = extractAddress(tags);
  const neighborhood = tags['addr:suburb'] ?? tags['is_in:neighbourhood'] ?? null;
  const openingHours = tags.opening_hours ?? null;

  return {
    venue_name:         name,
    venue_address:      full,
    venue_address_line: line,
    venue_city:         city,
    venue_region:       region,
    venue_postal:       postal,
    venue_country:      'US',
    venue_lat:          lat,
    venue_lng:          lng,
    venue_opening_hours: openingHours,
    neighborhood,
    // Passthrough of the OSM tag this scraper already filtered on (tourism=
    // museum|gallery) — same `category` hint convention every other scraper
    // hands the funnel. Not a classification decision made here:
    // db/funnel.js -> scrapers/classify.js is still the
    // only place that maps it to the controlled-vocabulary 'Visual Arts &
    // Museums' category, via CATEGORY_ALIASES.
    category:           tags.tourism === 'gallery' ? 'Gallery' : 'Museum',
    source_name:        'OpenStreetMap',
  };
}

export async function fetchVenues() {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(buildQuery())}`,
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

  const data = await res.json();
  const elements = data.elements ?? [];
  if (!elements.length) {
    console.warn('[osm_museums] 0 elements returned — Overpass query may be rate-limited or have changed');
  }

  return elements.map(normalizeVenue).filter(Boolean);
}
