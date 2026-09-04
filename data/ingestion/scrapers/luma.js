import { load } from 'cheerio';

export const name = 'luma';
export const envKey = null;

const NYC_URL = 'https://luma.com/nyc';
const BASE    = 'https://lu.ma';

// NYC bounding box — filter out any events outside the five boroughs
const NYC = { minLng: -74.26, maxLng: -73.70, minLat: 40.49, maxLat: 40.92 };

function inNYC(lat, lng) {
  return lat >= NYC.minLat && lat <= NYC.maxLat && lng >= NYC.minLng && lng <= NYC.maxLng;
}

function formatPrice(ticketInfo) {
  if (!ticketInfo || ticketInfo.is_free) return null;
  const cents = ticketInfo.price?.cents;
  const currency = ticketInfo.price?.currency;
  if (cents == null || !currency) return null;
  const amount = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return currency.toUpperCase() === 'USD' ? `$${amount}` : `${amount} ${currency.toUpperCase()}`;
}

// `entry` is the sibling structure the /nyc feed returns per item: { event,
// ticket_info, hosts, tags, ... } — ticket_info/hosts sit alongside event,
// not inside it.
function normalizeEvent(entry) {
  const e = entry?.event ?? entry;
  if (!e?.name || !e?.start_at) return null;

  const start  = new Date(e.start_at);
  const end    = e.end_at ? new Date(e.end_at) : null;
  if (isNaN(start)) return null;

  const coord  = e.coordinate;
  const lat    = coord?.latitude  ? parseFloat(coord.latitude)  : null;
  const lng    = coord?.longitude ? parseFloat(coord.longitude) : null;
  const hasCoords = lat != null && lng != null && inNYC(lat, lng);

  // geo_address_info gives city-level info; sublocality = neighborhood
  const geo    = e.geo_address_info;
  const addr   = geo?.city_state ?? 'New York, NY';

  // Build a canonical lu.ma event URL
  const sourceUrl = e.url
    ? (e.url.startsWith('http') ? e.url : `${BASE}/${e.url}`)
    : `${BASE}/${e.api_id}`;

  const ticketInfo = entry?.ticket_info ?? null;
  const host = entry?.hosts?.[0] ?? null;

  return {
    title:         e.name,
    external_id:   e.api_id ?? null,
    venue_name:    geo?.sublocality ?? geo?.city ?? 'New York City',
    venue_address: addr,
    venue_city:    geo?.city ?? null,
    venue_region:  geo?.region_short ?? geo?.region ?? null,
    venue_country: geo?.country_code ?? 'US',
    venue_lat:     hasCoords ? lat : null,
    venue_lng:     hasCoords ? lng : null,
    start_time:    start.toISOString(),
    end_time:      end ? end.toISOString() : null,
    timezone:      e.timezone ?? 'America/New_York',
    category:      null,
    tags:          entry?.tags ?? [],
    description:   host?.bio_short ?? null,
    organizer_name: host?.name ?? null,
    price_text:    formatPrice(ticketInfo),
    is_free:       ticketInfo?.is_free ?? false,
    image_url:     e.cover_url ?? null,
    venue_website_url: host?.website ?? null,
    venue_image_url:   host?.avatar_url ?? null,
    venue_description: host?.bio_short ?? null,
    source_url:    sourceUrl,
    source_name:   'Luma',
    confidence_score: 0.8,
    review_status: 'candidate',
  };
}

export async function fetchEvents() {
  const res = await fetch(NYC_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) throw new Error(`Luma HTTP ${res.status}`);

  const $ = load(await res.text());
  const nextDataEl = $('#__NEXT_DATA__');
  if (!nextDataEl.length) throw new Error('Luma: __NEXT_DATA__ not found');

  let data;
  try { data = JSON.parse(nextDataEl.html()); } catch { throw new Error('Luma: failed to parse __NEXT_DATA__'); }

  const events = data?.props?.pageProps?.initialData?.data?.events ?? [];
  if (!events.length) {
    console.warn('[luma] 0 events in __NEXT_DATA__ — page may have geo-defaulted away from NYC');
  }

  return events.map(entry => normalizeEvent(entry)).filter(Boolean);
}
