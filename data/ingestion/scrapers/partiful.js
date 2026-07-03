import fetch from 'node-fetch';
import { load } from 'cheerio';
import { extractPrice } from './utils.js';

export const name = 'partiful';
export const envKey = null;

const BASE    = 'https://partiful.com';
const EXPLORE = `${BASE}/explore/nyc`;

// Tag labels that are boroughs, not real categories — Partiful tags every
// event with both its topical tags ("Music", "Community") and its borough
// ("Brooklyn"). Never usable as a category.
const BOROUGH_TAGS = new Set(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']);

// "All" (Partiful's "browse everything" tag, id DISCOVER_HOME) isn't a real
// category either — also never usable.
const NEVER_CATEGORY_TAGS = new Set([...BOROUGH_TAGS, 'All']);

// "Community" almost every NYC event gets tagged regardless of what it
// actually is, so it should lose to a more specific tag (Music, Arts, Food,
// Fitness) when one is present — but it's still a fine category on its own
// when nothing more specific exists.
const LOW_PRIORITY_TAGS = new Set(['Community']);

// locationInfo comes in two shapes: a structured address (mapsInfo.name +
// addressLines) or a freeform string for hosts who typed their own address.
function buildVenueAddress(locationInfo) {
  if (!locationInfo) return null;
  if (locationInfo.type === 'structured') {
    const lines = locationInfo.mapsInfo?.addressLines ?? [];
    return lines.length ? lines.join(', ') : (locationInfo.approximateLocation ?? null);
  }
  if (locationInfo.type === 'freeform') return locationInfo.value ?? null;
  return null;
}

function normalizeEvent(item) {
  const event = item?.event;
  if (!event?.title || !event?.startDate) return null;

  const address = buildVenueAddress(event.locationInfo);
  if (!address) return null; // can't place without an address

  const venueName = event.locationInfo?.mapsInfo?.name || address.split(',')[0].trim();

  const tags = (item.tags ?? []).map(t => t.label).filter(Boolean);
  const category = tags.find(t => !NEVER_CATEGORY_TAGS.has(t) && !LOW_PRIORITY_TAGS.has(t))
                 ?? tags.find(t => !NEVER_CATEGORY_TAGS.has(t))
                 ?? null;

  // Partiful has no structured price field, but hosts often write the cost
  // directly into the description ("Tickets are $20", "FREE SHOW", "Free
  // with RSVP"). Best-effort only — events with no price mention stay
  // unknown rather than guessing.
  const { price_text, is_free } = extractPrice(event.description ?? '');

  return {
    title:         event.title,
    external_id:   event.id,
    venue_name:    venueName,
    venue_address: address, // comma-separated "street, city, ST zip" — splitUSAddress() in upsertVenue parses this
    venue_lat:     null,
    venue_lng:     null,
    start_time:    event.startDate,
    end_time:      event.endDate ?? null,
    // event.timezone reflects the HOST's own account timezone setting, not
    // the event's physical location — a host whose Partiful account is set
    // to America/Los_Angeles or Europe/London still shows up here with that
    // timezone even though the event itself is in NYC (confirmed live: 3 of
    // 68 scraped events had a non-NY timezone despite all being NYC events,
    // since this scraper only reads partiful.com/explore/nyc). start_time
    // itself (a UTC instant) is unaffected and stays correct either way —
    // this only fixes which clock time it's displayed as.
    timezone:      'America/New_York',
    category,
    tags,
    description:   event.description ?? null,
    price_text,
    is_free,
    organizer_name: event.hostName ?? null,
    image_url:     event.image?.url ?? null,
    source_url:    `${BASE}/e/${event.id}`,
    source_name:   'Partiful',
    confidence_score: 0.6,
    review_status: 'needs_review',
  };
}

export async function fetchEvents() {
  const res = await fetch(EXPLORE, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) throw new Error(`Partiful HTTP ${res.status}`);

  const $ = load(await res.text());
  const nextDataEl = $('#__NEXT_DATA__');
  if (!nextDataEl.length) throw new Error('Partiful: __NEXT_DATA__ not found');

  let data;
  try { data = JSON.parse(nextDataEl.html()); } catch { throw new Error('Partiful: failed to parse __NEXT_DATA__'); }

  const pageProps = data?.props?.pageProps ?? {};

  // The explore page embeds the same event-card data in several places —
  // the main feed, a "Trending in NYC" carousel, and per-theme sections
  // ("Weekend Forecast", "Celebrate Pride", etc.) — each with real
  // description/category/tags/end-time/host data already structured.
  // Pooling all of them (deduped by event id) finds ~4x more NYC events
  // than the main feed alone.
  const allItems = [
    ...(pageProps.feedItems ?? []),
    ...(pageProps.trendingSection?.items ?? []),
    ...(pageProps.sections ?? []).flatMap(s => s.items ?? []),
  ];

  if (!allItems.length) {
    console.warn('[partiful] 0 items in __NEXT_DATA__ — page structure may have changed');
  }

  const seen = new Set();
  const rows = [];
  for (const item of allItems) {
    if (item?.type !== 'event') continue;
    const row = normalizeEvent(item);
    if (!row || seen.has(row.external_id)) continue;
    seen.add(row.external_id);
    rows.push(row);
  }

  if (!rows.length) {
    console.warn('[partiful] no usable events found — Partiful may have changed their data shape');
  }

  return rows;
}
