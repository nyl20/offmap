import fetch from 'node-fetch';
import { load } from 'cheerio';
import { nextWeekday, extractAgeRestriction, buildWeeklyRRule } from './utils.js';

export const name = 'bbg';
export const envKey = null;

const BASE          = 'https://www.bbg.org';
const CALENDAR_URL  = `${BASE}/visit/calendar`;
const VENUE_NAME    = 'Brooklyn Botanic Garden';
const VENUE_ADDRESS = '990 Washington Ave, Brooklyn, NY 11225';
const VENUE_CITY    = 'Brooklyn';
const VENUE_REGION  = 'NY';
const VENUE_POSTAL  = '11225';
const VENUE_LAT     = 40.6694;
const VENUE_LNG     = -73.9626;

const WEEKDAY_RE = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi;

const MONTH_IDX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse a date from BBG event-date text.
 * Handles: "May 23–October 25, 2026", "Saturday, June 13, 2026", "Wednesdays"
 * Always returns the START date as YYYY-MM-DD, or null.
 */
function parseBbgDate(raw) {
  const text  = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const yearM = text.match(/\b(\d{4})\b/);
  const year  = yearM ? parseInt(yearM[1]) : new Date().getFullYear();

  // First occurrence of "Month D" or "Month Dth"
  const mdM = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (mdM) {
    const mon = MONTH_IDX[mdM[1].slice(0, 3).toLowerCase()];
    if (mon !== undefined) {
      const now = new Date();
      let d = new Date(year, mon, parseInt(mdM[2]));
      // If no explicit year and date is past, bump to next year
      if (!yearM && d < now) d = new Date(year + 1, mon, parseInt(mdM[2]));
      return toISO(d);
    }
  }

  // Recurring weekday like "Wednesdays & Fridays" → next occurrence of first day
  const dayM = text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
  if (dayM) return nextWeekday(dayM[1]);

  return null;
}

const CAT_MAP = [
  ['exhibit', 'Art'],
  ['famil', 'Family'],
  ['kids', 'Family'],
  ['wellness', 'Wellness'],
  ['tour', 'Education'],
  ['festival', 'Festival'],
  ['adult', 'Education'],
];

function normalizeCategory(text) {
  const lower = text.toLowerCase();
  return CAT_MAP.find(([k]) => lower.includes(k))?.[1] ?? 'Nature';
}

// Extract the first URL from an img srcset attribute
function parseSrcset(srcset) {
  if (!srcset) return null;
  const first = srcset.split(',')[0].trim().split(/\s+/)[0];
  return first.startsWith('http') ? first : `${BASE}${first}`;
}

export async function fetchEvents() {
  const res = await fetch(CALENDAR_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) throw new Error(`BBG HTTP ${res.status}`);

  const $ = load(await res.text());
  const rows = [];
  const seen = new Set();

  // All BBG calendar events live in <li class="dontmiss-event"> elements
  $('li.dontmiss-event').each((_, el) => {
    const $el = $(el);

    const linkEl    = $el.find('a[href*="/visit/event/"]').first();
    const href      = linkEl.attr('href');
    const title     = $el.find('h3').first().text().trim();
    if (!title || !href) return;

    const sourceUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    if (seen.has(sourceUrl)) return;
    seen.add(sourceUrl);

    const dateText  = $el.find('p.event-date').html() ?? '';
    const dateStr   = parseBbgDate(dateText);
    if (!dateStr) return;

    const catText   = $el.find('span.event-tag').text().trim();
    const descText  = $el.find('p.event-blurb').text().replace(/Learn More.*$/i, '').trim() || null;
    const imageUrl  = parseSrcset($el.find('img[srcset]').attr('srcset'));
    const isFree    = /free/i.test(dateText) ? 'true' : 'false';

    // BBG slugs are stable identifiers: /visit/event/ancestral_ecologies
    const externalId = href.match(/\/visit\/event\/([^/?]+)/)?.[1] ?? null;

    // Recurring weekday events ("Wednesdays & Fridays") → build an RRULE
    const recurringDays = dateText.match(WEEKDAY_RE);
    const recurrenceRule = recurringDays ? buildWeeklyRRule(recurringDays) : null;

    rows.push({
      title,
      external_id:   externalId,
      venue_name:    VENUE_NAME,
      venue_address: VENUE_ADDRESS,
      venue_address_line: VENUE_ADDRESS.split(',')[0],
      venue_city:    VENUE_CITY,
      venue_region:  VENUE_REGION,
      venue_postal:  VENUE_POSTAL,
      venue_country: 'US',
      venue_lat:     VENUE_LAT,
      venue_lng:     VENUE_LNG,
      start_time:    `${dateStr}T10:00:00`,
      end_time:      null,
      timezone:      'America/New_York',
      recurrence_rule: recurrenceRule,
      category:      normalizeCategory(catText),
      tags:          [],
      description:   descText,
      price_text:    null,
      is_free:       isFree,
      age_restriction: extractAgeRestriction(descText ?? ''),
      organizer_name: VENUE_NAME,
      image_url:     imageUrl,
      source_url:    sourceUrl,
      source_name:   'Brooklyn Botanic Garden',
      confidence_score: 0.85,
      review_status: 'candidate',
    });
  });

  return rows;
}
