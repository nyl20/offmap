import { load } from 'cheerio';
import { extractAgeRestriction } from './utils.js';

export const name   = 'donyc';
export const envKey = null;

const BASE = 'https://www.donyc.com';
const URL  = `${BASE}/events/`;

const NYC = { minLng: -74.26, maxLng: -73.70, minLat: 40.49, maxLat: 40.92 };
function inNYC(lat, lng) {
  return lat >= NYC.minLat && lat <= NYC.maxLat && lng >= NYC.minLng && lng <= NYC.maxLng;
}

// Date is embedded in the event URL: /events/2026/6/18/mario-tickets
function dateFromHref(href) {
  const m = href.match(/\/events\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Category from class list: ds-event-category-music → Music
function categoryFromClass(cls) {
  const m = cls.match(/ds-event-category-([a-z-]+)/);
  if (!m) return null;
  return m[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// Background-image URL from style="background-image:url('...')"
function bgImageUrl(style) {
  const m = style?.match(/url\(['"]?([^'")\s]+)['"]?\)/);
  return m ? m[1] : null;
}

export async function fetchEvents() {
  const res = await fetch(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Do NYC HTTP ${res.status}`);

  const $ = load(await res.text());
  const rows = [];
  const seen = new Set();

  // Schema.org microformat — every event is itemtype="http://schema.org/Event"
  $('[itemtype="http://schema.org/Event"]').each((_, el) => {
    const $el = $(el);

    // Title
    const title = $el.find('[itemprop="name"]').first().text().trim();
    if (!title) return;

    // Source URL — the event detail link
    const href = $el.find('a.url, a[itemprop="url"]').first().attr('href');
    if (!href) return;
    const sourceUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    // Date from URL path
    const dateStr = dateFromHref(href);
    if (!dateStr) return;

    // Venue — nested Schema.org Place
    const $venue    = $el.find('[itemtype="http://schema.org/Place"]').first();
    const venueName = $venue.find('[itemprop="name"]').first().text().trim();
    const street    = $venue.find('meta[itemprop="streetAddress"]').attr('content') ?? '';
    const city      = $venue.find('meta[itemprop="addressLocality"]').attr('content') ?? 'New York';
    const region    = $venue.find('meta[itemprop="addressRegion"]').attr('content') ?? 'NY';
    const zip       = $venue.find('meta[itemprop="postalCode"]').attr('content') ?? '';
    const fullAddr  = street ? `${street}, ${city}, ${region} ${zip}`.trim() : `${city}, ${region}`;

    // Lat/Lng from GeoCoordinates
    const lat = parseFloat($venue.find('meta[itemprop="latitude"]').attr('content') ?? '');
    const lng = parseFloat($venue.find('meta[itemprop="longitude"]').attr('content') ?? '');
    const hasCoords = !isNaN(lat) && !isNaN(lng) && inNYC(lat, lng);

    // Time from itemprop="startDate" or itemprop="dtstart"
    const startDateMeta = $el.find('meta[itemprop="startDate"], [itemprop="dtstart"]').attr('content') ?? '';
    const startTime = startDateMeta.includes('T') ? startDateMeta : `${dateStr}T20:00:00`;

    // Category from event div class
    const category = categoryFromClass($el.attr('class') ?? '');

    // Cover image from background-image style
    const coverEl  = $el.find('[class*="cover-image"], [class*="ds-cover"]').first();
    const imageUrl = bgImageUrl(coverEl.attr('style') ?? '') ?? null;

    // Event slug doubles as a stable identifier: /events/2026/6/18/mario-tickets
    const externalId = href.match(/\/events\/\d{4}\/\d{1,2}\/\d{1,2}\/([^/?]+)/)?.[1] ?? null;

    rows.push({
      title,
      external_id:   externalId,
      venue_name:    venueName || city,
      venue_address: fullAddr,
      venue_address_line: street || null,
      venue_city:    city,
      venue_region:  region,
      venue_postal:  zip || null,
      venue_country: 'US',
      venue_lat:     hasCoords ? lat : null,
      venue_lng:     hasCoords ? lng : null,
      start_time:    startTime,
      end_time:      null,
      timezone:      'America/New_York',
      category,
      tags:          [],
      description:   null,
      price_text:    null,
      is_free:       'false',
      age_restriction: extractAgeRestriction(title),
      image_url:     imageUrl,
      source_url:    sourceUrl,
      source_name:   'Do NYC',
      confidence_score: 0.85,
      review_status: 'candidate',
    });
  });

  if (!rows.length) console.warn('[donyc] no events found — markup may have changed');
  return rows;
}
