
export const name   = 'nycopendata';
export const envKey = null;

// NYC Open Data — Event Permits (dataset tvpp-9vvx) via Socrata API.
// 32,000+ permitted events. We filter to the public-interest types only:
// Special Event, Farmers Market, Block Party, Parade, Street Festival, etc.
// Sport permits (16K+ records) are excluded.
const BASE_URL   = 'https://data.cityofnewyork.us/resource/tvpp-9vvx.json';
const PAGE_SIZE  = 200;
const MAX_PAGES  = 3; // 3 × 200 = 600 events max per run

// Only the event types worth showing on the map
const INCLUDE_TYPES = new Set([
  'Special Event', 'Street Event', 'Farmers Market', 'Block Party',
  'Parade', 'Plaza Partner Event', 'Open Street Partner Event',
  'Single Block Festival', 'Street Festival', 'Health Fair', 'Plaza Event',
]);
const EXCLUDED_TYPES = null; // replaced by INCLUDE_TYPES allowlist above

// A subset of event_name values carry a "YYYY.MM.DD <title>" date-code
// prefix (e.g. "2026.06.26 Kissena Park Forest Restoration") that matches
// nycgovparks.org/events/YYYY/MM/DD/<slugified-title> exactly — confirmed
// against the live site. Most records in this feed are permits with no
// individual calendar page at all, so this only fires for the subset that
// actually follows that convention; everything else keeps the search-page
// fallback below rather than guessing a slug that may 404.
const DATE_CODE_PREFIX_RE = /^(\d{4})\.(\d{2})\.(\d{2})\s+(.+)$/;

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function nycParksEventUrl(eventName, eventId) {
  const m = eventName.match(DATE_CODE_PREFIX_RE);
  if (m) {
    const [, year, month, day, title] = m;
    const slug = slugify(title);
    if (slug) return `https://www.nycgovparks.org/events/${year}/${month}/${day}/${slug}`;
  }
  // No individual page derivable — fall back to the event search page.
  return `https://www.nycgovparks.org/events?q=${encodeURIComponent(eventName)}&id=${eventId}`;
}

const BOROUGH_MAP = {
  manhattan:    'Manhattan, NY',
  brooklyn:     'Brooklyn, NY',
  queens:       'Queens, NY',
  bronx:        'Bronx, NY',
  'staten island': 'Staten Island, NY',
};

function normalizeEvent(rec) {
  if (!rec.event_name || !rec.start_date_time) return null;

  const eventType = rec.event_type ?? '';
  if (!INCLUDE_TYPES.has(eventType)) return null;

  const startISO = rec.start_date_time.replace('.000', '');
  const endISO   = rec.end_date_time?.replace('.000', '') ?? null;

  // Skip if already in the past
  if (new Date(startISO) < new Date()) return null;

  const borough     = rec.event_borough?.toLowerCase() ?? '';
  const boroughAddr = BOROUGH_MAP[borough] ?? 'New York, NY';
  const location    = rec.event_location ?? '';

  // Venue name: strip the field code after colon (e.g. "Red Hook Recreation Area: Baseball-03" → "Red Hook Recreation Area")
  const venueName = location.includes(':')
    ? location.split(':')[0].trim()
    : location || 'New York City Park';

  // Category mapping from event type
  const catMap = [
    ['Art', 'Art'], ['Cultural', 'Cultural'], ['Film', 'Film'],
    ['Music', 'Music'], ['Community', 'Community'], ['Festival', 'Festival'],
    ['Market', 'Market'], ['Health', 'Wellness'], ['Education', 'Education'],
    ['Nature', 'Nature'], ['Ceremony', 'Community'],
  ];
  const category = catMap.find(([k]) => eventType.includes(k))?.[1] ?? 'Community';

  // Individual event page when event_name carries the date-code prefix
  // convention; otherwise falls back to the event search page.
  const sourceUrl = nycParksEventUrl(rec.event_name, rec.event_id);

  return {
    title:         rec.event_name,
    external_id:   rec.event_id ? String(rec.event_id) : null,
    venue_name:    venueName,
    venue_address: `${venueName}, ${boroughAddr}`,
    venue_city:    rec.event_borough ?? null,
    venue_region:  'NY',
    venue_country: 'US',
    venue_lat:     null, // dataset lacks geocoordinates; geocoder will resolve by name
    venue_lng:     null,
    start_time:    startISO,
    end_time:      endISO,
    timezone:      'America/New_York',
    category,
    tags:          eventType ? [eventType] : [],
    description:   null,
    price_text:    null,
    is_free:       'true', // NYC Parks events are free
    organizer_name: rec.event_agency ?? null,
    image_url:     null,
    source_url:    sourceUrl,
    source_name:   'NYC Open Data',
    confidence_score: 0.75,
    review_status: 'candidate',
  };
}

export async function fetchEvents() {
  const now    = new Date().toISOString().slice(0, 19);
  const rows   = [];
  const seen   = new Set();

  for (let page = 0; page < MAX_PAGES; page++) {
    // Build URL manually — URLSearchParams double-encodes the $where clause
    const where  = encodeURIComponent(`start_date_time>'${now}'`);
    const offset = page * PAGE_SIZE;
    const url    = `${BASE_URL}?$limit=${PAGE_SIZE}&$offset=${offset}&$where=${where}&$order=start_date_time%20ASC`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'MapApp/1.0 (NYC events pipeline)', Accept: 'application/json' },
    });

    if (!res.ok) throw new Error(`NYC Open Data HTTP ${res.status}`);
    const records = await res.json();
    if (!Array.isArray(records) || records.length === 0) break;

    let added = 0;
    for (const rec of records) {
      const key = rec.event_id ?? rec.event_name;
      if (seen.has(key)) continue;
      seen.add(key);
      const row = normalizeEvent(rec);
      if (row) { rows.push(row); added++; }
    }

    console.log(`[nycopendata] page ${page + 1}: ${added} usable events (${records.length} fetched)`);
    if (records.length < PAGE_SIZE) break;
    if (page < MAX_PAGES - 1) await new Promise(r => setTimeout(r, 200));
  }

  return rows;
}
