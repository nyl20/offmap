import { load } from 'cheerio';

export const name = 'untappedcities';
export const envKey = null;

const BASE = 'https://www.untappedcities.com';
const URL  = `${BASE}/tag/things-to-do/`;

// Ghost CMS date format: "Jun 13, 2026"
const MONTH_IDX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseGhostDate(text) {
  const m = text.trim().match(/^(\w{3})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (!m) return null;
  const mon = MONTH_IDX[m[1].toLowerCase()];
  if (mon === undefined) return null;
  const d = new Date(parseInt(m[3]), mon, parseInt(m[2]));
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

export async function fetchEvents() {
  const res = await fetch(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Untapped Cities HTTP ${res.status}`);

  const $ = load(await res.text());
  const rows = [];
  const seen = new Set();

  // Ghost CMS: article cards — try multiple known selector patterns
  $('article, .post-card, .gh-card').each((_, el) => {
    const $el = $(el);

    // Link — Ghost cards wrap their content in an <a>
    const linkEl    = $el.find('a[href*="/"]').first();
    const href      = linkEl.attr('href') ?? $el.find('[class*="link"] a, h2 a, h3 a').attr('href');
    if (!href || href.startsWith('#')) return;

    const sourceUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    if (seen.has(sourceUrl)) return;
    // Skip tag/category index pages and non-article links
    if (/\/(tag|author|page)\//.test(sourceUrl)) return;
    seen.add(sourceUrl);

    const title = $el.find('h2, h3, [class*="title"]').first().text().trim();
    if (!title) return;

    // Ghost CMS date: look for <time> element or text matching "Jun 13, 2026"
    const timeEl   = $el.find('time');
    const dateText = timeEl.attr('datetime') ?? timeEl.text().trim()
                  ?? $el.find('[class*="date"], [class*="meta"]').text().trim();
    const dateStr  = parseGhostDate(dateText) ?? new Date().toISOString().slice(0, 10);

    const description = $el.find('[class*="excerpt"], p').first().text().trim() || null;
    const imageUrl    = $el.find('img').first().attr('src')
                     ?? $el.find('source').first().attr('srcset')?.split(',')[0].trim().split(' ')[0]
                     ?? null;

    // Article slug is a stable identifier: untappedcities.com/2026/06/13/article-slug
    const externalId = sourceUrl.match(/untappedcities\.com\/(?:\d{4}\/\d{2}\/\d{2}\/)?([^/?]+)\/?$/)?.[1] ?? null;

    rows.push({
      title,
      external_id:   externalId,
      venue_name:    'New York City',
      venue_address: 'New York, NY',
      venue_lat:     null,
      venue_lng:     null,
      start_time:    `${dateStr}T10:00:00`,
      end_time:      null,
      timezone:      'America/New_York',
      category:      'Things to Do',
      tags:          [],
      description,
      price_text:    null,
      is_free:       'false',
      // organizer_name intentionally omitted — Untapped Cities is the publisher,
      // not the event organizer, and the article rarely names one.
      image_url:     imageUrl?.startsWith('http') ? imageUrl : null,
      source_url:    sourceUrl,
      source_name:   'Untapped Cities',
      confidence_score: 0.5,
      review_status: 'needs_review',
    });
  });

  return rows;
}
