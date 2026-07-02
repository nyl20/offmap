import fetch from 'node-fetch';
import { load } from 'cheerio';
import { extractDate, extractTime, extractPrice, extractAgeRestriction } from './utils.js';

export const name = 'theskint';
export const envKey = null;

const RSS_URL = 'https://www.theskint.com/rss';
const BASE    = 'https://www.theskint.com';

// The Skint publishes daily NYC event digests. Each RSS item is one blog post
// covering free/cheap events for that day. We store each post as one event
// record and flag for review — the description contains the full event info.

function stripHtml(html) {
  return html?.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
         ?? '';
}

// Try to pull a specific venue from prose like "at The Bell House (Brooklyn)"
function extractVenue(text) {
  const m = text.match(/\b(?:at|@)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s'&.\-]{2,40}?)(?:\s*[\(\[]|\s*[–\-|,]|\s*$)/);
  return m ? m[1].trim() : null;
}

// Parse RFC 2822 date from <pubDate> e.g. "Fri, 12 Jun 2026 12:45:50 +0000"
function parsePubDate(raw) {
  const d = new Date(raw);
  return isNaN(d) ? null : d.toISOString();
}

export async function fetchEvents() {
  const res = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`The Skint RSS HTTP ${res.status}`);

  // Cheerio handles RSS XML with xmlMode
  const $ = load(await res.text(), { xmlMode: true });
  const rows = [];
  const seen = new Set();

  $('item').each((_, el) => {
    const $el      = $(el);
    const title    = $el.find('title').text().trim();
    const link     = $el.find('link').text().trim();
    const pubDate  = $el.find('pubDate').text().trim();
    const descHtml = $el.find('description').text()  // CDATA text
                  || $el.find('encoded').text()
                  || '';

    if (!title || !link) return;
    if (seen.has(link)) return;
    seen.add(link);

    const startDt = parsePubDate(pubDate);
    if (!startDt) return;

    const descText = stripHtml(descHtml);
    const venue    = extractVenue(title) ?? extractVenue(descText);
    const { price_text, is_free } = extractPrice(descText + ' ' + title);

    // Post slug is a stable identifier: theskint.com/fri-mon-6-12-15-skint-weekend/
    const externalId = link.match(/theskint\.com\/([^/?]+)\/?$/)?.[1] ?? null;

    rows.push({
      title,
      external_id:   externalId,
      venue_name:    venue ?? 'Various NYC Venues',
      venue_address: 'New York, NY',
      venue_lat:     null,
      venue_lng:     null,
      start_time:    startDt,
      end_time:      null,
      timezone:      'America/New_York',
      category:      'Events',
      tags:          [],
      description:   descText.slice(0, 500) || null,
      price_text,
      is_free,
      age_restriction: extractAgeRestriction(descText + ' ' + title),
      image_url:     null,
      source_url:    link,
      source_name:   'The Skint',
      confidence_score: 0.55,
      review_status: 'needs_review',
    });
  });

  return rows;
}
