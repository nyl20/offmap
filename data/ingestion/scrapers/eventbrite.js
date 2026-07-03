// Eventbrite scraper
//
// Eventbrite's v3/events/search/ API endpoint has been deprecated (returns 404).
// Instead we scrape their public discover pages, which embed all event data as
// JSON-LD inside window.__SERVER_DATA__ — no API key required.
//
// EVENTBRITE_TOKEN is kept in .env for future use if they restore the API.

import fetch from 'node-fetch';

export const name   = 'eventbrite';
export const envKey = null; // HTML scraping — no token needed

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Multiple category pages — each returns up to 40 events
const PAGES = [
  'https://www.eventbrite.com/d/ny--new-york/events/',
  'https://www.eventbrite.com/d/ny--new-york/free--events/',
  'https://www.eventbrite.com/d/ny--new-york/music--events/',
  'https://www.eventbrite.com/d/ny--new-york/food-and-drink--events/',
  'https://www.eventbrite.com/d/ny--new-york/arts--events/',
  'https://www.eventbrite.com/d/ny--new-york/nightlife--events/',
];

const NYC = { minLng: -74.26, maxLng: -73.70, minLat: 40.49, maxLat: 40.92 };
function inNYC(lat, lng) {
  return lat >= NYC.minLat && lat <= NYC.maxLat && lng >= NYC.minLng && lng <= NYC.maxLng;
}

function extractServerData(html) {
  const start = html.indexOf('window.__SERVER_DATA__');
  if (start === -1) return null;
  const brace = html.indexOf('{', start);
  if (brace === -1) return null;
  let depth = 0, end = brace;
  for (let i = brace; i < Math.min(html.length, brace + 600000); i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try { return JSON.parse(html.slice(brace, end)); } catch { return null; }
}

function normalizeItem(item) {
  if (!item?.name || !item?.url || !item?.startDate) return null;

  const loc    = item.location;
  const addr   = loc?.address ?? {};
  const geo    = loc?.geo ?? {};

  const street   = addr.streetAddress ?? '';
  const city     = addr.addressLocality ?? 'New York';
  const region   = addr.addressRegion ?? 'NY';
  const zip      = addr.postalCode ?? '';
  const fullAddr = street
    ? `${street}, ${city}, ${region} ${zip}`.trim()
    : `${city}, ${region}`;

  const lat       = geo.latitude  ? parseFloat(geo.latitude)  : null;
  const lng       = geo.longitude ? parseFloat(geo.longitude) : null;
  const hasCoords = lat != null && lng != null && inNYC(lat, lng);

  const startTime = item.startDate.includes('T') ? item.startDate : `${item.startDate}T00:00:00`;
  const endTime   = item.endDate
    ? (item.endDate.includes('T') ? item.endDate : `${item.endDate}T23:59:59`)
    : null;

  // The trailing digits in the URL are Eventbrite's own event ID
  const externalId = item.url.match(/-(\d+)\/?$/)?.[1] ?? null;

  return {
    title:         item.name,
    external_id:   externalId,
    venue_name:    loc?.name ?? city,
    venue_address: fullAddr,
    venue_address_line: street || null,
    venue_city:    city,
    venue_region:  region,
    venue_postal:  zip || null,
    venue_country: 'US',
    venue_lat:     hasCoords ? lat : null,
    venue_lng:     hasCoords ? lng : null,
    start_time:    startTime,
    end_time:      endTime,
    timezone:      'America/New_York',
    category:      null,
    tags:          [],
    description:   item.description?.slice(0, 500) ?? null,
    price_text:    null, // not exposed in Eventbrite's JSON-LD; would need their (deprecated) API
    is_free:       'false',
    image_url:     item.image ?? null,
    source_url:    item.url,
    source_name:   'Eventbrite',
    confidence_score: 0.85,
    review_status: 'candidate',
  };
}

export async function fetchEvents() {
  const rows = [];
  const seen = new Set();

  for (const pageUrl of PAGES) {
    let html;
    try {
      const res = await fetch(pageUrl, { headers: BROWSER_HEADERS });
      if (!res.ok) { console.warn(`[eventbrite] ${pageUrl.slice(36)} → HTTP ${res.status}`); continue; }
      html = await res.text();
    } catch (err) {
      console.warn(`[eventbrite] ${pageUrl.slice(36)} fetch failed: ${err.message}`);
      continue;
    }

    const data  = extractServerData(html);
    if (!data) { console.warn(`[eventbrite] no SERVER_DATA on ${pageUrl.slice(36)}`); continue; }

    const items = data.jsonld?.[0]?.itemListElement ?? [];
    let added   = 0;
    for (const { item } of items) {
      if (!item?.url || seen.has(item.url)) continue;
      seen.add(item.url);
      const row = normalizeItem(item);
      if (row) { rows.push(row); added++; }
    }

    console.log(`[eventbrite] ${pageUrl.slice(36)}: ${added} new events`);
    await new Promise(r => setTimeout(r, 500));
  }

  return rows;
}
