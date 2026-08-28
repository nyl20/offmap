import fetch from 'node-fetch';
import { load } from 'cheerio';

const USER_AGENT = 'offmap-bot/1.0 (NYC events discovery app)';
const TIMEOUT_MS = 7000;

// A website's meta description/JSON-LD is untrusted third-party content —
// domains expire, sites get hijacked, and a compromised page can silently
// replace its own description with unrelated spam (observed in production:
// a legitimate venue's scraped description came back as Vietnamese
// gambling-site text after its domain was compromised). Requiring the
// scraped text to share at least one distinctive word with the venue's own
// name is a cheap check — same principle as matchedVenueIdentity() in
// geocoding/mapbox.js, which rejects a geocoder's "match" the same way when
// it can't verify the result actually pertains to what was asked for. Not
// foolproof (a legitimate page's copy doesn't always repeat the exact
// venue name), so this only rejects when the venue name has a distinctive
// word to check AND that word is absent — it doesn't invent a positive
// signal that isn't there.
const STOPWORDS = new Set(['the', 'and', 'for', 'nyc', 'new', 'york', 'shop', 'store']);

function significantWords(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

function looksRelevant(venueName, text) {
  const wanted = significantWords(venueName ?? '');
  if (!wanted.length) return true; // nothing distinctive to verify against
  return wanted.some(w => text.toLowerCase().includes(w));
}

function parseJsonLd($) {
  const result = { description: null, image_url: null, phone: null, opening_hours: null };

  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).html()); } catch { return; }

    const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];

    for (const node of nodes) {
      if (!result.description && node.description)
        result.description = String(node.description).trim();

      if (!result.phone && node.telephone)
        result.phone = String(node.telephone).trim();

      if (!result.image_url) {
        const img = node.image;
        if (typeof img === 'string') result.image_url = img;
        else if (img?.url) result.image_url = img.url;
        else if (Array.isArray(img) && img[0])
          result.image_url = typeof img[0] === 'string' ? img[0] : (img[0]?.url ?? null);
      }

      if (!result.opening_hours && node.openingHours) {
        result.opening_hours = Array.isArray(node.openingHours)
          ? node.openingHours.join(', ')
          : String(node.openingHours);
      }
    }
  });

  return result;
}

export async function enrichVenue(websiteUrl, venueName) {
  const empty = { description: null, image_url: null, phone: null, opening_hours: null };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(websiteUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) return empty;

    const html = await res.text();
    const $ = load(html);
    const ld = parseJsonLd($);

    const description = ld.description
      ?? $('meta[property="og:description"]').attr('content')
      ?? $('meta[name="description"]').attr('content')
      ?? null;

    const trimmedDescription = description ? description.slice(0, 500).trim() : null;

    // Check the page's own title alongside the description — a hijacked/
    // parked/repurposed domain (see looksRelevant's doc comment above)
    // usually replaces both, so this catches more than checking either
    // field alone. If nothing on the page plausibly relates to the venue,
    // distrust the whole scrape rather than any single field from it.
    const pageTitle = $('title').first().text();
    const relevanceText = [pageTitle, trimmedDescription].filter(Boolean).join(' ');
    if (relevanceText && !looksRelevant(venueName, relevanceText)) return empty;

    const image_url = ld.image_url
      ?? $('meta[property="og:image"]').attr('content')
      ?? null;

    const phone = ld.phone ?? (() => {
      const href = $('a[href^="tel:"]').first().attr('href');
      return href ? href.replace(/^tel:/, '').trim() : null;
    })();

    return {
      description: trimmedDescription,
      image_url:   image_url || null,
      phone:       phone || null,
      opening_hours: ld.opening_hours || null,
    };
  } catch {
    return empty;
  }
}
