// Partiful adapter — reuses the __NEXT_DATA__ mining proven in
// scrapers/partiful.js (built for the /explore/nyc feed) generalized to an
// arbitrary Partiful URL. Partiful is primarily single-event pages
// (partiful.com/e/<id>) rather than a persistent per-venue calendar, so the
// realistic case here is "a venue links to its next Partiful event" — one
// row, not a list — with the pooled feed/section shape kept as a fallback
// in case the given URL happens to be an explore-style listing page.
//
// UNVERIFIED, flagged rather than guessed: the exact __NEXT_DATA__ key for a
// single-event page's own event object (pageProps.event is a reasonable
// guess by analogy with the feed item shape, not confirmed live) — falls
// through to the generic pipeline (null) if it isn't found rather than
// fabricating a row from a guessed path.

import { load } from 'cheerio';
import { extractPrice } from '../../utils.js';

export const platform = 'partiful';

export function matches(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') === 'partiful.com';
  } catch {
    return false;
  }
}

const BOROUGH_TAGS = new Set(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']);
const NEVER_CATEGORY_TAGS = new Set([...BOROUGH_TAGS, 'All']);
const LOW_PRIORITY_TAGS = new Set(['Community']);

function buildVenueAddress(locationInfo) {
  if (!locationInfo) return null;
  if (locationInfo.type === 'structured') {
    const lines = locationInfo.mapsInfo?.addressLines ?? [];
    return lines.length ? lines.join(', ') : (locationInfo.approximateLocation ?? null);
  }
  if (locationInfo.type === 'freeform') return locationInfo.value ?? null;
  return null;
}

function normalizeEvent(event, tagLabels = []) {
  if (!event?.title || !event?.startDate) return null;

  const address = buildVenueAddress(event.locationInfo);
  if (!address) return null; // can't place without an address

  const venueName = event.locationInfo?.mapsInfo?.name || address.split(',')[0].trim();

  const category = tagLabels.find(t => !NEVER_CATEGORY_TAGS.has(t) && !LOW_PRIORITY_TAGS.has(t))
                 ?? tagLabels.find(t => !NEVER_CATEGORY_TAGS.has(t))
                 ?? null;

  const { price_text, is_free } = extractPrice(event.description ?? '');

  return {
    title:         event.title,
    external_id:   event.id,
    venue_name:    venueName,
    venue_address: address,
    start_time:    event.startDate,
    end_time:      event.endDate ?? null,
    timezone:      null,
    category,
    tags:          tagLabels,
    description:   event.description ?? null,
    price_text,
    is_free,
    organizer_name: event.hostName ?? null,
    image_url:     event.image?.url ?? null,
    source_url:    `https://partiful.com/e/${event.id}`,
    source_name:   'Partiful',
    confidence_score: 0.6,
    review_status: 'needs_review',
  };
}

export async function extract(html) {
  const $ = load(html);
  const el = $('#__NEXT_DATA__');
  if (!el.length) return null;

  let data;
  try { data = JSON.parse(el.html()); } catch { return null; }

  const pageProps = data?.props?.pageProps ?? {};

  // Single-event page — the realistic case for a venue's own Partiful link.
  if (pageProps.event) {
    const tags = (pageProps.tags ?? []).map(t => t.label ?? t).filter(Boolean);
    const row = normalizeEvent(pageProps.event, tags);
    return row ? { rows: [row], confidence: 0.6, detectionTier: 'platform_adapter', renderMode: 'http' } : null;
  }

  // Explore/feed-style page — fallback, same pooling as scrapers/partiful.js.
  const allItems = [
    ...(pageProps.feedItems ?? []),
    ...(pageProps.trendingSection?.items ?? []),
    ...(pageProps.sections ?? []).flatMap(s => s.items ?? []),
  ];
  if (!allItems.length) return null;

  const seen = new Set();
  const rows = [];
  for (const item of allItems) {
    if (item?.type !== 'event') continue;
    const tags = (item.tags ?? []).map(t => t.label).filter(Boolean);
    const row = normalizeEvent(item.event, tags);
    if (!row || seen.has(row.external_id)) continue;
    seen.add(row.external_id);
    rows.push(row);
  }

  return rows.length ? { rows, confidence: 0.6, detectionTier: 'platform_adapter', renderMode: 'http' } : null;
}
