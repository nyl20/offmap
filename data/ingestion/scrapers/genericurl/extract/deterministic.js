// Tier 1 extraction: schema.org JSON-LD Event markup and, failing that,
// Event microdata. Adapter-agnostic — this is what handles a one-off site
// that isn't Luma/Eventbrite/Partiful/Webflow but still plays nice and
// marks up its events properly (the existing scrapers/donyc.js and
// scrapers/nycparks.js both rely on exactly this kind of markup). Free,
// deterministic, and — when it finds something — the highest-confidence
// tier in the whole pipeline, since the site is telling us directly what an
// event is rather than us inferring it from prose.

import { load } from 'cheerio';

function typesOf(node) {
  const t = node?.['@type'];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

function isEventType(node) {
  return typesOf(node).some(t => String(t).toLowerCase().includes('event'));
}

// JSON-LD can nest events inside @graph, an ItemList (itemListElement), or
// just be a bare array/object at the top level — walk all plausible shapes
// rather than assuming one.
function collectEventNodes(parsed, out) {
  if (!parsed || typeof parsed !== 'object') return;
  if (Array.isArray(parsed)) { parsed.forEach(n => collectEventNodes(n, out)); return; }

  if (isEventType(parsed)) out.push(parsed);
  if (Array.isArray(parsed['@graph'])) collectEventNodes(parsed['@graph'], out);
  if (Array.isArray(parsed.itemListElement)) {
    for (const el of parsed.itemListElement) collectEventNodes(el?.item ?? el, out);
  }
}

function addressToText(location) {
  const addr = location?.address;
  if (!addr) return null;
  if (typeof addr === 'string') return addr;
  const { streetAddress, addressLocality, addressRegion, postalCode } = addr;
  return [streetAddress, addressLocality, [addressRegion, postalCode].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ') || null;
}

function priceFromOffers(offers) {
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer) return { price_text: null, is_free: 'false' };
  const price = offer.price ?? offer.lowPrice;
  if (price === 0 || price === '0' || price === '0.00') return { price_text: 'Free', is_free: 'true' };
  if (price != null) return { price_text: `$${price}`, is_free: 'false' };
  return { price_text: null, is_free: 'false' };
}

function normalizeSchemaEvent(node, pageUrl) {
  const title = node.name;
  const start = node.startDate;
  if (!title || !start) return null;

  const location = Array.isArray(node.location) ? node.location[0] : node.location;
  const { price_text, is_free } = priceFromOffers(node.offers);
  const image = Array.isArray(node.image) ? node.image[0] : node.image;
  const organizer = Array.isArray(node.organizer) ? node.organizer[0] : node.organizer;

  return {
    title,
    start_time: start,
    end_time: node.endDate ?? null,
    venue_name: typeof location === 'object' ? (location?.name ?? null) : (typeof location === 'string' ? location : null),
    venue_address: addressToText(location),
    description: typeof node.description === 'string' ? node.description.slice(0, 1000) : null,
    price_text,
    is_free,
    organizer_name: typeof organizer === 'object' ? (organizer?.name ?? null) : (organizer ?? null),
    image_url: typeof image === 'string' ? image : (image?.url ?? null),
    source_url: node.url ?? pageUrl,
    confidence_score: 0.9,
    review_status: 'candidate',
  };
}

function extractJsonLdEvents(html, pageUrl) {
  const $ = load(html);
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let parsed;
    try { parsed = JSON.parse($(el).contents().text()); } catch { return; }
    collectEventNodes(parsed, nodes);
  });
  return nodes.map(n => normalizeSchemaEvent(n, pageUrl)).filter(Boolean);
}

// Basic schema.org microdata reader (itemscope/itemtype/itemprop) —
// deliberately only handles the flat, single-level case (an Event itemscope
// with itemprop children directly inside it), which covers the common
// static-HTML pattern without building a full microdata parser.
function extractMicrodataEvents(html, pageUrl) {
  const $ = load(html);
  const rows = [];

  $('[itemscope][itemtype*="Event" i]').each((_, el) => {
    const $el = $(el);
    const prop = (name) => $el.find(`[itemprop="${name}"]`).first();

    const title = prop('name').attr('content') || prop('name').text().trim();
    const startEl = prop('startDate');
    const start = startEl.attr('content') || startEl.attr('datetime') || startEl.text().trim();
    if (!title || !start) return;

    const endEl = prop('endDate');
    const end = endEl.attr('content') || endEl.attr('datetime') || endEl.text().trim() || null;

    const venueName = prop('location').find('[itemprop="name"]').first().text().trim()
      || prop('location').text().trim() || null;
    const urlEl = prop('url');
    const url = urlEl.attr('href') || urlEl.attr('content') || pageUrl;
    const imageEl = prop('image');
    const image = imageEl.attr('src') || imageEl.attr('content') || null;

    rows.push({
      title,
      start_time: start,
      end_time: end,
      venue_name: venueName,
      venue_address: prop('location').find('[itemprop="address"]').first().text().trim() || null,
      description: prop('description').text().trim().slice(0, 1000) || null,
      price_text: null,
      is_free: 'false',
      image_url: image,
      source_url: url,
      confidence_score: 0.75,
      review_status: 'candidate',
    });
  });

  return rows;
}

export function extractDeterministic(html, url) {
  const jsonLdRows = extractJsonLdEvents(html, url);
  if (jsonLdRows.length) {
    return { rows: jsonLdRows, confidence: 0.9, detectionTier: 'jsonld', renderMode: 'http' };
  }

  const microdataRows = extractMicrodataEvents(html, url);
  if (microdataRows.length) {
    return { rows: microdataRows, confidence: 0.75, detectionTier: 'microdata', renderMode: 'http' };
  }

  return null;
}
