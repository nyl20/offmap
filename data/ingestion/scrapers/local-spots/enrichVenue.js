import fetch from 'node-fetch';
import { load } from 'cheerio';

const USER_AGENT = 'offmap-bot/1.0 (NYC events discovery app)';
const TIMEOUT_MS = 7000;

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

export async function enrichVenue(websiteUrl) {
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

    const image_url = ld.image_url
      ?? $('meta[property="og:image"]').attr('content')
      ?? null;

    const phone = ld.phone ?? (() => {
      const href = $('a[href^="tel:"]').first().attr('href');
      return href ? href.replace(/^tel:/, '').trim() : null;
    })();

    return {
      description: description ? description.slice(0, 500).trim() : null,
      image_url:   image_url || null,
      phone:       phone || null,
      opening_hours: ld.opening_hours || null,
    };
  } catch {
    return empty;
  }
}
