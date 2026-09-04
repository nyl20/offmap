// Eventbrite adapter — generalizes the window.__SERVER_DATA__ + JSON-LD
// mining technique already proven in scrapers/eventbrite.js (built for NYC
// discovery/category pages) to an arbitrary Eventbrite URL, most usefully
// an organizer's page (eventbrite.com/o/<slug>) listing several upcoming
// events, which is the Eventbrite equivalent of "a venue's calendar page."
//
// A single EVENT page's own JSON-LD is typically simple enough that the
// generic tier-1 deterministic JSON-LD scan (extract/deterministic.js)
// already handles it without needing this adapter at all — extract() below
// only returns rows when it finds the itemListElement shape (multi-event
// listing pages); otherwise it returns null and lets the generic pipeline
// pick up whatever JSON-LD/embedded state is on the page.
//
// UNVERIFIED, flagged rather than guessed: whether an organizer page's
// __SERVER_DATA__ has the exact same jsonld[0].itemListElement shape as the
// category discovery pages the existing scraper targets — confirm against a
// real organizer URL before trusting this in production.

export const platform = 'eventbrite';

export function matches(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') === 'eventbrite.com';
  } catch {
    return false;
  }
}

function extractServerData(html) {
  const start = html.indexOf('window.__SERVER_DATA__');
  if (start === -1) return null;
  const brace = html.indexOf('{', start);
  if (brace === -1) return null;
  let depth = 0, end = brace;
  for (let i = brace; i < Math.min(html.length, brace + 600_000); i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try { return JSON.parse(html.slice(brace, end)); } catch { return null; }
}

function normalizeItem(item) {
  if (!item?.name || !item?.url || !item?.startDate) return null;

  const loc  = item.location;
  const addr = loc?.address ?? {};
  const geo  = loc?.geo ?? {};

  const street   = addr.streetAddress ?? '';
  const city     = addr.addressLocality ?? null;
  const region   = addr.addressRegion ?? null;
  const zip      = addr.postalCode ?? '';
  const fullAddr = street
    ? `${street}, ${city ?? ''}, ${region ?? ''} ${zip}`.replace(/\s+/g, ' ').trim()
    : [city, region].filter(Boolean).join(', ') || null;

  const lat = geo.latitude  ? parseFloat(geo.latitude)  : null;
  const lng = geo.longitude ? parseFloat(geo.longitude) : null;

  const startTime = item.startDate.includes('T') ? item.startDate : `${item.startDate}T00:00:00`;
  const endTime   = item.endDate
    ? (item.endDate.includes('T') ? item.endDate : `${item.endDate}T23:59:59`)
    : null;

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
    venue_lat:     lat,
    venue_lng:     lng,
    start_time:    startTime,
    end_time:      endTime,
    timezone:      null,
    category:      null,
    tags:          [],
    description:   item.description?.slice(0, 500) ?? null,
    price_text:    null,
    is_free:       'false',
    image_url:     item.image ?? null,
    source_url:    item.url,
    source_name:   'Eventbrite',
    confidence_score: 0.85,
    review_status: 'candidate',
  };
}

export async function extract(html) {
  const data = extractServerData(html);
  if (!data) return null;

  const items = data.jsonld?.[0]?.itemListElement ?? [];
  if (!items.length) return null;

  const seen = new Set();
  const rows = [];
  for (const { item } of items) {
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    const row = normalizeItem(item);
    if (row) rows.push(row);
  }

  return rows.length ? { rows, confidence: 0.85, detectionTier: 'platform_adapter', renderMode: 'http' } : null;
}
