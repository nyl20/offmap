import fetch from 'node-fetch';
import { load } from 'cheerio';
import { extractTime } from './utils.js';

export const name = 'moma';
export const envKey = null;

const BASE         = 'https://www.moma.org';
const CALENDAR_URL = `${BASE}/calendar/`;
const VENUE_NAME   = 'Museum of Modern Art (MoMA)';
const VENUE_ADDRESS = '11 W 53rd St, New York, NY 10019';
const VENUE_LAT    = 40.7614;
const VENUE_LNG    = -73.9776;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
};

// Parse ISO or partial date strings from JSON-LD / HTML
function parseStartDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d.toISOString();
}

// Extract events from JSON-LD <script type="application/ld+json"> blocks
function extractJsonLd($) {
  const rows = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).html()); } catch { return; }

    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (item['@type'] !== 'Event') continue;

      const start = parseStartDate(item.startDate);
      if (!start) continue;

      const locName = item.location?.name ?? VENUE_NAME;
      const locAddr = item.location?.address?.streetAddress
        ? `${item.location.address.streetAddress}, ${item.location.address.addressLocality ?? 'New York'}, NY`
        : VENUE_ADDRESS;

      // Only trust the hardcoded main-building coordinates when the event is
      // actually AT the main building — an off-site program (e.g. MoMA PS1
      // in Queens) would otherwise get pinned on 53rd St in Manhattan.
      const isMainBuilding = locName === VENUE_NAME;

      rows.push({
        title:         item.name,
        venue_name:    locName,
        venue_address: locAddr,
        venue_lat:     isMainBuilding ? VENUE_LAT : null,
        venue_lng:     isMainBuilding ? VENUE_LNG : null,
        start_time:    start,
        end_time:      parseStartDate(item.endDate),
        timezone:      'America/New_York',
        category:      'Art',
        tags:          [],
        description:   item.description?.slice(0, 500) ?? null,
        price_text:    item.offers?.price ? `$${item.offers.price}` : null,
        is_free:       item.offers?.price === 0 ? 'true' : 'false',
        image_url:     item.image ?? null,
        source_url:    item.url ?? CALENDAR_URL,
        source_name:   'MoMA',
        confidence_score: 0.9,
        review_status: 'candidate',
      });
    }
  });
  return rows;
}

// Fallback: parse event cards from MoMA's React-rendered HTML
function extractHtml($) {
  const rows = [];
  const seen = new Set();

  // MoMA uses several possible patterns depending on their React build;
  // try all known selectors and take the first that yields results.
  const CARD_SELECTORS = [
    '[class*="CalendarEventCard"]',
    '[class*="EventCard"]',
    '[class*="event-card"]',
    '.calendar-listing__item',
    'article[data-event-id]',
  ];

  let $cards = $();
  for (const sel of CARD_SELECTORS) {
    $cards = $(sel);
    if ($cards.length) break;
  }

  $cards.each((_, el) => {
    const $el = $(el);

    const linkEl = $el.find('a[href*="/calendar/"]').first();
    const href   = linkEl.attr('href');
    const title  = $el.find('h2, h3, [class*="title"], [class*="Title"]').first().text().trim()
                || linkEl.text().trim();
    if (!title || !href) return;

    const sourceUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    // Date text — look for a time element or date-labelled element
    const dateEl   = $el.find('time, [class*="date"], [class*="Date"]').first();
    const dateText = dateEl.attr('datetime') ?? dateEl.text().trim();
    const startDt  = parseStartDate(dateText);
    if (!startDt) return;

    const description = $el.find('[class*="description"], [class*="Description"], p').first().text().trim() || null;
    const imageUrl    = $el.find('img').first().attr('src') ?? null;
    const priceText   = $el.find('[class*="price"], [class*="Price"]').first().text().trim() || null;

    rows.push({
      title,
      venue_name:    VENUE_NAME,
      venue_address: VENUE_ADDRESS,
      venue_lat:     VENUE_LAT,
      venue_lng:     VENUE_LNG,
      start_time:    startDt,
      end_time:      null,
      timezone:      'America/New_York',
      category:      'Art',
      tags:          [],
      description,
      price_text:    priceText,
      is_free:       /free/i.test(priceText ?? '') ? 'true' : 'false',
      image_url:     imageUrl,
      source_url:    sourceUrl,
      source_name:   'MoMA',
      confidence_score: 0.8,
      review_status: 'candidate',
    });
  });

  return rows;
}

export async function fetchEvents() {
  let res;
  try {
    res = await fetch(CALENDAR_URL, { headers: BROWSER_HEADERS });
  } catch (err) {
    throw new Error(`MoMA network error: ${err.message}`);
  }

  if (res.status === 403 || res.status === 429) {
    console.warn(`[moma] blocked (HTTP ${res.status}) — site requires a headless browser; returning 0 events`);
    return [];
  }

  if (!res.ok) throw new Error(`MoMA HTTP ${res.status}`);

  const $ = load(await res.text());

  // JSON-LD is authoritative when present
  const ldRows = extractJsonLd($);
  if (ldRows.length) return ldRows;

  // Fall back to HTML card parsing
  const htmlRows = extractHtml($);
  if (!htmlRows.length) {
    console.warn('[moma] no events found in HTML — MoMA may have changed their markup');
  }
  return htmlRows;
}
