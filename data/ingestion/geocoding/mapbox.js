import { getDb } from '../db/supabase.js';

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

// Loose NY tri-state sanity bounds — wide enough for legitimate Long
// Island/NJ/CT venues, tight enough to reject the wrong-continent mismatches
// Mapbox returns for generic facility names ("Basketball Courts", "Play
// Area") that have no real street address to disambiguate against.
const TRI_STATE_BBOX = { minLng: -75.5, maxLng: -71.5, minLat: 39.0, maxLat: 42.5 };

function inTriState(lat, lng) {
  return lat >= TRI_STATE_BBOX.minLat && lat <= TRI_STATE_BBOX.maxLat
      && lng >= TRI_STATE_BBOX.minLng && lng <= TRI_STATE_BBOX.maxLng;
}

// Connector/admin words that appear in nearly every query — useless for
// telling whether Mapbox actually matched the *specific* venue we asked for.
const ADDRESS_STOPWORDS = new Set([
  'the', 'of', 'and', 'between', 'bet', 'ave', 'avenue', 'st', 'street',
  'blvd', 'boulevard', 'rd', 'road', 'dr', 'drive', 'pl', 'place', 'plaza',
  'park', 'new', 'york', 'ny', 'nyc', 'court', 'ct', 'pkwy', 'parkway',
  'w', 'e', 'n', 's',
]);

function significantWords(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !ADDRESS_STOPWORDS.has(w));
}

// Mapbox's legacy geocoder will silently drop query words it can't match and
// fall back to whatever's nearest the proximity bias — while still reporting
// relevance: 1, as if it were a confident match. The only reliable tell is
// `data.query`, the token list Mapbox actually searched on: if none of the
// distinctive words from the venue's primary identifier survived into it,
// the "match" is really just "somewhere near Manhattan" and should be
// rejected rather than trusted as a precise point.
function matchedVenueIdentity(address, queryTokens) {
  const wanted = significantWords(address.split(',')[0]);
  if (!wanted.length) return true; // nothing distinctive to verify against
  const used = new Set((queryTokens ?? []).map(t => String(t).toLowerCase()));
  return wanted.some(w => used.has(w));
}

// matchedVenueIdentity above verifies a match against whatever comes before
// the query's FIRST comma — so prepending a venue name only helps when
// locationText is vague ("East Village", a bare city/neighborhood) and
// actively breaks the check when locationText is already a full street
// address, since the venue name then occupies the slot the check verifies
// the address against instead of the address itself. Confirmed live during
// the TikTok import feature's build: geocoding "Zaidi's NYC, 139 Division
// St, New York, NY 10002" returned null while the address alone resolved
// correctly. A leading digit is a reliable enough signal that a string is
// already a real street address.
const LOOKS_LIKE_STREET_ADDRESS = /^\s*\d/;

/**
 * Builds a safe geocode query from a venue name and a location string of
 * unknown specificity — used by any caller that has both a name and a
 * loosely-sourced location (as opposed to a scraper's own already-complete
 * address field, which should just be passed to geocodeAddress directly).
 */
export function buildGeocodeQuery(venueName, locationText) {
  if (venueName && !LOOKS_LIKE_STREET_ADDRESS.test(locationText)) {
    return `${venueName}, ${locationText}`;
  }
  return locationText;
}

/**
 * Geocode a single address string via the Mapbox Geocoding API.
 * Returns { longitude, latitude, neighborhood, confidence } or null on failure.
 *
 * Exported (unlike the rest of this file's helpers) so a synchronous,
 * one-off caller — e.g. the TikTok import preview endpoint, which needs a
 * point on the map immediately rather than waiting for the next
 * geocode-pending batch pass — can geocode a single address inline.
 */
export async function geocodeAddress(address, token) {
  const encoded = encodeURIComponent(address);
  const bbox = `${TRI_STATE_BBOX.minLng},${TRI_STATE_BBOX.minLat},${TRI_STATE_BBOX.maxLng},${TRI_STATE_BBOX.maxLat}`;
  // country + bbox keep Mapbox from matching same-named POIs outside the
  // region entirely; proximity nudges ties toward Manhattan. "place" is
  // deliberately excluded from types — it lets vague queries (a bare
  // facility name + borough, no street) fall back to a city-level centroid,
  // which silently collapses many distinct unrelated venues onto the same
  // point instead of honestly failing to geocode.
  const url = `${MAPBOX_GEOCODING_URL}/${encoded}.json?access_token=${token}&limit=1&types=address,poi`
    + `&country=US&bbox=${bbox}&proximity=-73.9712,40.7831`;

  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mapbox API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (!data.features?.length) return null;
  if (!matchedVenueIdentity(address, data.query)) return null;

  const feature = data.features[0];
  const [longitude, latitude] = feature.center;

  // Defense in depth in case a result still slips outside the sanity bounds.
  if (!inTriState(latitude, longitude)) return null;

  // Mapbox returns relevance 0–1 as its confidence proxy
  const confidence = feature.relevance ?? null;

  // Extract neighborhood from context array
  const neighborhood = feature.context
    ?.find(c => c.id.startsWith('neighborhood.') || c.id.startsWith('locality.'))
    ?.text ?? null;

  return { longitude, latitude, neighborhood, confidence };
}

/**
 * Geocode all venues that have no coordinates yet.
 * Respects a configurable per-call delay to stay within rate limits.
 *
 * Returns { resolved, failed, skipped }
 */
export async function geocodePendingVenues({ delayMs = 200 } = {}) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error('MAPBOX_TOKEN env variable is not set');

  const db = getDb();

  const { data: pending, error } = await db.from('venues').select('id, name, address').is('location', null);
  if (error) throw new Error(`fetching pending venues failed: ${error.message}`);

  const summary = { resolved: 0, failed: 0, skipped: 0 };

  // Addresses that are too generic to geocode accurately on their own
  const GENERIC_ADDR_RE = /^new york,?\s*ny$/i;

  // Multiple pending venues can share the same address string in one run
  // (e.g. several spaces in the same building) — cache by geocode query so
  // each distinct address only ever costs one Mapbox call per run, not one
  // per venue row.
  const geocodeCache = new Map();

  for (let i = 0; i < pending.length; i++) {
    const venue = pending[i];
    // Skip "New York City" placeholder venues — they have no specific location
    if (/^new york city$/i.test(venue.name) && GENERIC_ADDR_RE.test(venue.address)) {
      console.log(`[geocode] skipping generic placeholder venue ${venue.id}: "${venue.name}"`);
      summary.skipped++;
      continue;
    }

    // When address is just "New York, NY", prepend the venue name so Mapbox can resolve it
    const geocodeQuery = GENERIC_ADDR_RE.test(venue.address)
      ? `${venue.name}, New York, NY`
      : venue.address;

    let calledMapbox = false;
    try {
      let result;
      if (geocodeCache.has(geocodeQuery)) {
        result = geocodeCache.get(geocodeQuery);
      } else {
        calledMapbox = true;
        result = await geocodeAddress(geocodeQuery, token);
        geocodeCache.set(geocodeQuery, result);
      }

      if (!result) {
        console.warn(`[geocode] No result for venue ${venue.id}: "${geocodeQuery}"`);
        summary.failed++;
      } else {
        const { error: rpcError } = await db.rpc('set_venue_geocode', {
          p_venue_id:     venue.id,
          p_lat:          result.latitude,
          p_lng:          result.longitude,
          p_neighborhood: result.neighborhood,
          p_confidence:   result.confidence,
          p_provider:     'mapbox',
        });
        if (rpcError) throw new Error(rpcError.message);
        console.log(`[geocode] ✓ venue ${venue.id} "${venue.name}" → [${result.longitude}, ${result.latitude}]`);
        summary.resolved++;
      }
    } catch (err) {
      console.error(`[geocode] ✗ venue ${venue.id} "${venue.name}": ${err.message}`);
      summary.failed++;
    }

    // No need to rate-limit a cache hit — no Mapbox call was made.
    if (calledMapbox && delayMs > 0 && i < pending.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  if (pending.length === 0) {
    console.log('[geocode] No pending venues to geocode.');
  }

  return summary;
}

/**
 * Reverse-geocode a single lng/lat pair to a neighborhood name via Mapbox.
 * Returns the neighborhood string, or null if none is found.
 */
async function reverseGeocodeNeighborhood(lng, lat, token) {
  const url = `${MAPBOX_GEOCODING_URL}/${lng},${lat}.json?access_token=${token}&types=neighborhood,locality&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox reverse geocode error ${res.status}`);
  const data = await res.json();
  return data.features?.[0]?.text ?? null;
}

/**
 * Backfill `neighborhood` for venues that already have coordinates but no
 * neighborhood — this happens for scrapers that supply their own lat/lng
 * (BBG, Luma, Eventbrite, Do NYC, Resident Advisor) and therefore skip the
 * forward-geocoding pass entirely. Costs one Mapbox call per venue, once —
 * cached forever after via the `neighborhood IS NULL` filter.
 *
 * Returns { resolved, failed }
 */
export async function backfillNeighborhoods({ delayMs = 200 } = {}) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error('MAPBOX_TOKEN env variable is not set');

  const db = getDb();

  const { data: pending, error } = await db
    .from('venues')
    .select('id, name, latitude, longitude')
    .is('neighborhood', null)
    .not('location', 'is', null);
  if (error) throw new Error(`fetching neighborhood-pending venues failed: ${error.message}`);

  const summary = { resolved: 0, failed: 0 };

  for (let i = 0; i < pending.length; i++) {
    const venue = pending[i];
    try {
      const neighborhood = await reverseGeocodeNeighborhood(venue.longitude, venue.latitude, token);
      if (neighborhood) {
        const { error: updateError } = await db.from('venues').update({ neighborhood }).eq('id', venue.id);
        if (updateError) throw new Error(updateError.message);
        console.log(`[geocode] ✓ neighborhood for venue ${venue.id} "${venue.name}" → ${neighborhood}`);
        summary.resolved++;
      } else {
        console.warn(`[geocode] no neighborhood found for venue ${venue.id} "${venue.name}"`);
        summary.failed++;
      }
    } catch (err) {
      console.error(`[geocode] ✗ neighborhood lookup for venue ${venue.id}: ${err.message}`);
      summary.failed++;
    }

    if (delayMs > 0 && i < pending.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  if (pending.length === 0) console.log('[geocode] No venues need neighborhood backfill.');

  return summary;
}

/**
 * Reverse-geocode a single lng/lat pair to street/city/postal details via
 * Mapbox. Returns { addressLine, city, postalCode } (any field may be null
 * if Mapbox's response doesn't include it), or null if no address feature
 * is found.
 */
async function reverseGeocodeAddressDetails(lng, lat, token) {
  const url = `${MAPBOX_GEOCODING_URL}/${lng},${lat}.json?access_token=${token}&types=address&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox reverse geocode error ${res.status}`);
  const data = await res.json();

  const feature = data.features?.[0];
  if (!feature) return null;

  // Mapbox's address features split the street number into `address` and
  // the street name into `text` — same convention as the venue's own
  // `address_line` elsewhere in this codebase (splitUSAddress in
  // scrapers/utils.js), so this stays consistent with rows populated that
  // way instead of by reverse geocoding.
  const addressLine = [feature.address, feature.text].filter(Boolean).join(' ') || null;
  const city = feature.context?.find(c => c.id.startsWith('place.'))?.text ?? null;
  const postalCode = feature.context?.find(c => c.id.startsWith('postcode.'))?.text ?? null;

  return { addressLine, city, postalCode };
}

/**
 * Backfill address_line/city/postal_code for venues that already have a
 * geocoded location but are missing one or more of those fields — this
 * happens for scrapers whose source data has no structured address (OSM
 * nodes without addr:housenumber/addr:street, an Instagram post that only
 * names a venue) but that DID resolve to real coordinates. Only fills
 * currently-null columns (progressive enrichment, same principle as
 * upsert_venue's COALESCE and backfillNeighborhoods above) — never
 * overwrites a value a scraper already supplied.
 *
 * Returns { resolved, failed }
 */
export async function backfillAddressDetails({ delayMs = 200 } = {}) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error('MAPBOX_TOKEN env variable is not set');

  const db = getDb();

  const { data: pending, error } = await db
    .from('venues')
    .select('id, name, latitude, longitude, address_line, city, postal_code')
    .not('location', 'is', null)
    .or('address_line.is.null,city.is.null,postal_code.is.null');
  if (error) throw new Error(`fetching address-pending venues failed: ${error.message}`);

  const summary = { resolved: 0, failed: 0 };

  for (let i = 0; i < pending.length; i++) {
    const venue = pending[i];
    try {
      const result = await reverseGeocodeAddressDetails(venue.longitude, venue.latitude, token);
      if (result) {
        const patch = {};
        if (!venue.address_line && result.addressLine) patch.address_line = result.addressLine;
        if (!venue.city && result.city) patch.city = result.city;
        if (!venue.postal_code && result.postalCode) patch.postal_code = result.postalCode;

        if (Object.keys(patch).length) {
          const { error: updateError } = await db.from('venues').update(patch).eq('id', venue.id);
          if (updateError) throw new Error(updateError.message);
          console.log(`[geocode] ✓ address details for venue ${venue.id} "${venue.name}" → ${JSON.stringify(patch)}`);
        }
        summary.resolved++;
      } else {
        console.warn(`[geocode] no address details found for venue ${venue.id} "${venue.name}"`);
        summary.failed++;
      }
    } catch (err) {
      console.error(`[geocode] ✗ address backfill for venue ${venue.id}: ${err.message}`);
      summary.failed++;
    }

    if (delayMs > 0 && i < pending.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  if (pending.length === 0) console.log('[geocode] No venues need address-detail backfill.');

  return summary;
}

/**
 * Geocode a single venue by ID (useful for targeted re-geocoding).
 */
export async function geocodeVenueById(venueId) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) throw new Error('MAPBOX_TOKEN env variable is not set');

  const db = getDb();
  const { data: venue, error } = await db.from('venues').select('id, name, address').eq('id', venueId).single();
  if (error || !venue) throw new Error(`Venue ${venueId} not found`);

  const result = await geocodeAddress(venue.address, token);
  if (!result) {
    console.warn(`[geocode] No result for "${venue.address}"`);
    return null;
  }

  const { error: rpcError } = await db.rpc('set_venue_geocode', {
    p_venue_id:     venue.id,
    p_lat:          result.latitude,
    p_lng:          result.longitude,
    p_neighborhood: result.neighborhood,
    p_confidence:   result.confidence,
    p_provider:     'mapbox',
  });
  if (rpcError) throw new Error(rpcError.message);

  return result;
}
