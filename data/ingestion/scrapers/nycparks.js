import fetch from 'node-fetch';
import { load } from 'cheerio';

export const name   = 'nycparks';
export const envKey = null;

// https://www.nycgovparks.org/events serves full Schema.org Event microdata
// in static HTML (not JS-rendered, despite older assumptions) and isn't
// blocked by robots.txt. 50 events/page, paginated /events/p2, /events/p3, …
// up to several hundred pages reaching years out. We cap at MAX_PAGES since
// density falls off fast — page 20 already reaches ~2 weeks out.
const BASE      = 'https://www.nycgovparks.org';
const MAX_PAGES = 20;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// NYC Parks' own category taxonomy ("Shape Up NYC", "Basketball/Netball",
// "Arts & Crafts", etc.) mapped down to the app's broader category set.
// Order matters — checked in priority order against the full tag list, since
// a single event commonly carries several overlapping tags (e.g. a rec-center
// program tagged both "Sports" and "Arts & Crafts").
const CATEGORY_MAP = [
  ['Concert', 'Music'], ['Music', 'Music'], ['Dance', 'Music'],
  ['Theater', 'Cultural'], ['Film', 'Film'], ['Movie', 'Film'],
  ['Market', 'Market'], ['Food', 'Market'],
  ['Garden', 'Nature'], ['Nature', 'Nature'], ['Wildlife', 'Nature'], ['Waterfront', 'Nature'],
  ['Education', 'Education'], ['STEM', 'Education'], ['History', 'Education'],
  ['Tour', 'Education'], ['Workshop', 'Education'],
  ['Shape Up', 'Wellness'], ['Fitness', 'Wellness'], ['Exercise', 'Wellness'],
  ['Sport', 'Wellness'], ['Basketball', 'Wellness'], ['Recreation', 'Wellness'],
  ['Exhibit', 'Art'], ['Art', 'Art'], ['Craft', 'Art'],
  ['Festival', 'Festival'],
];

function mapCategory(labels) {
  const joined = labels.join(' ');
  const hit = CATEGORY_MAP.find(([k]) => joined.includes(k));
  return hit?.[1] ?? 'Community';
}

// Most streetAddress values are a bare street segment ("Riverside Dr & W
// 150th St"), but some already come fully formed with city/state/zip baked
// in by the CMS — detect that case so we don't double-append the borough.
function buildVenueAddress(streetAddress, venueName, borough) {
  if (streetAddress && /[A-Z]{2}\s*\d{5}/.test(streetAddress)) return streetAddress;
  const base = streetAddress || venueName;
  return borough ? `${base}, ${borough}, NY` : `${base}, New York, NY`;
}

function parseEvent($, el) {
  const $el   = $(el);
  const $link = $el.find('h3.event-title a').first();
  const title = $link.text().trim();
  const href  = $link.attr('href');
  if (!title || !href) return null;

  const startRaw = $el.find('meta[itemprop="startDate"]').attr('content');
  if (!startRaw) return null;
  const start = new Date(startRaw);
  if (isNaN(start)) return null;

  const endRaw = $el.find('meta[itemprop="endDate"]').attr('content');
  const end    = endRaw ? new Date(endRaw) : null;

  const $loc          = $el.find('[itemprop="location"]').first();
  const venueName      = $loc.find('[itemprop="name"]').first().text().trim() || 'NYC Park';
  const streetAddress  = $loc.find('meta[itemprop="streetAddress"]').attr('content') || null;
  const borough        = $loc.find('[itemprop="addressLocality"]').first().text().trim() || null;

  const description = $el.find('[itemprop="description"]').first().text().trim() || null;
  const categories   = $el.find('p > span > a[href^="/events/"]').map((_, a) => $(a).text().trim()).get();
  const isFree       = /free!?/i.test($el.find('p').first().text());

  const imgSrc  = $el.find('img').first().attr('src');
  const imageUrl = imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `${BASE}${imgSrc}`) : null;

  return {
    title,
    venue_name:    venueName,
    venue_address: buildVenueAddress(streetAddress, venueName, borough),
    venue_city:    borough,
    venue_region:  'NY',
    venue_country: 'US',
    venue_lat:     null, // no coordinates in the markup — geocoder resolves from the address
    venue_lng:     null,
    start_time:    start.toISOString(),
    end_time:      end && !isNaN(end) ? end.toISOString() : null,
    timezone:      'America/New_York',
    category:      mapCategory(categories),
    tags:          categories,
    description,
    price_text:    isFree ? 'Free' : null,
    is_free:       isFree ? 'true' : 'false',
    image_url:     imageUrl,
    source_url:    href.startsWith('http') ? href : `${BASE}${href}`,
    source_name:   'NYC Parks',
    confidence_score: 0.85,
    review_status: 'candidate',
  };
}

export async function fetchEvents() {
  const rows = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? `${BASE}/events` : `${BASE}/events/p${page}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`NYC Parks HTTP ${res.status}`);

    const $ = load(await res.text());
    const $events = $('div[itemtype="http://schema.org/Event"]');
    if (!$events.length) break;

    let added = 0;
    $events.each((_, el) => {
      const row = parseEvent($, el);
      if (!row || seen.has(row.source_url)) return;
      seen.add(row.source_url);
      rows.push(row);
      added++;
    });

    console.log(`[nycparks] page ${page}: ${added} events`);
    if (added === 0) break;
    if (page < MAX_PAGES) await new Promise(r => setTimeout(r, 200));
  }

  return rows;
}
