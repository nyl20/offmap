import fetch from 'node-fetch';
import { load } from 'cheerio';
import { extractDate, extractTime, extractPrice, extractAgeRestriction } from './utils.js';

export const name = 'timeout';
export const envKey = null;

const BASE      = 'https://www.timeout.com';
// The "this week" page is reliably structured with numbered event tiles
const WEEK_URL  = `${BASE}/newyork/things-to-do/things-to-do-in-new-york-this-week`;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Infer a rough venue from common title patterns: "X at Y", "X in Bryant Park"
function inferVenue(title) {
  const atMatch = title.match(/\b(?:at|@)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s'&.\-]{2,40}?)(?:\s*[–,]|\s*$)/);
  if (atMatch) return atMatch[1].trim();
  const inMatch = title.match(/\bin\s+((?:[A-Z][a-z]+ ?)+Park|(?:[A-Z][a-z]+ ?)+Garden|(?:[A-Z][a-z]+ ?)+Center|(?:[A-Z][a-z]+ ?)+Hall|(?:[A-Z][a-z]+ ?)+Museum)\b/);
  if (inMatch) return inMatch[1].trim();
  return null;
}

// "this week" means events are happening during the current ISO week
function thisWeekDate() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

export async function fetchEvents() {
  let res;
  try {
    res = await fetch(WEEK_URL, { headers: BROWSER_HEADERS });
  } catch (err) {
    throw new Error(`TimeOut network error: ${err.message}`);
  }

  if (res.status === 403 || res.status === 429) {
    console.warn(`[timeout] blocked (HTTP ${res.status}); returning 0 events`);
    return [];
  }
  if (!res.ok) throw new Error(`TimeOut HTTP ${res.status}`);

  const $ = load(await res.text());
  const rows = [];
  const seen = new Set();
  const weekStart = thisWeekDate();

  // TimeOut renders numbered event tiles: <h3 data-testid="tile-title_testID"><span>1.</span>&nbsp;Event Name</h3>
  // Each tile has an anchor wrapping to the article page
  $('[data-testid="tile-title_testID"]').each((_, el) => {
    const $el   = $(el);
    const raw   = $el.text().trim();
    // Strip the leading number: "1. Event title" → "Event title"
    const title = raw.replace(/^\d+\.\s*/, '').replace(/ /g, ' ').trim();
    if (!title) return;

    // Find the nearest ancestor anchor
    const $tile    = $el.closest('article, [data-testid*="tile"]');
    const href     = $tile.find('a').first().attr('href') ?? $el.closest('a').attr('href');
    if (!href) return;

    const sourceUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    // Try to extract a date from the full tile text; fall back to this week's Monday
    const tileText = $tile.text();
    const dateStr  = extractDate(tileText) ?? weekStart;
    const time     = extractTime(tileText) ?? '19:00:00';
    const { price_text, is_free } = extractPrice(tileText);

    const venue = inferVenue(title);
    const image = $tile.find('img').first().attr('src')
               ?? ($tile.find('source').first().attr('srcset') ?? '').split(',')[0].trim().split(' ')[0]
               ?? null;

    // Category from tag pills
    const category = $tile.find('[class*="tag"] span, [class*="Tag"] span').first().text().trim() || null;

    // Article slug is a stable identifier
    const externalId = sourceUrl.match(/timeout\.com\/[^/]+\/[^/]+\/([^/?]+)\/?$/)?.[1] ?? null;

    rows.push({
      title,
      external_id:   externalId,
      venue_name:    venue ?? 'New York City',
      venue_address: 'New York, NY',
      venue_lat:     null,
      venue_lng:     null,
      start_time:    `${dateStr}T${time}`,
      end_time:      null,
      timezone:      'America/New_York',
      category,
      tags:          [],
      description:   null,
      price_text,
      is_free,
      age_restriction: extractAgeRestriction(title),
      image_url:     image || null,
      source_url:    sourceUrl,
      source_name:   'TimeOut NYC',
      confidence_score: 0.55,
      review_status: 'needs_review', // dates are approximate; needs human review
    });
  });

  if (!rows.length) {
    console.warn('[timeout] no tiles found — TimeOut may have changed their markup');
  }

  return rows;
}
