// Webflow adapter — deliberately conservative, fingerprint-first.
//
// Empirically verified against https://www.bibliothequenyc.com/: it's a
// real Webflow site (assets served from website-files.com) with a real,
// server-rendered CMS collection at /art — but that collection is an
// artwork-for-sale inventory, not an events calendar, and its item text
// contains date-like substrings ("Edition 6, 2021") that a naive "found a
// Webflow collection ⇒ treat as events" rule would misfire on. There is
// also no /events route on that site at all (checked live — 404).
//
// So matches() only fingerprints the platform (cheap, reliable — Webflow
// always injects a `generator` meta tag and serves assets from
// website-files.com). extract() requires an explicit event-context signal
// (URL path or a nearby heading) before treating any collection item as an
// event at all, and even then returns low confidence — a bare collection
// block with date-like text is exactly the trap this site demonstrated is
// real, not hypothetical. Calibrating the fall-through threshold against a
// confirmed true-positive Webflow *events* site is still needed (see plan)
// — none was available to verify against directly, so this stays
// intentionally cautious rather than guessing a selector as fact.

import { load } from 'cheerio';
import { extractDate } from '../../utils.js';

export const platform = 'webflow';

const EVENT_CONTEXT_RE = /\/(events?|calendar|whats-on|what-s-on|happenings?)\b/i;
const EVENT_HEADING_RE = /\b(events?|calendar|what'?s on|happening|upcoming)\b/i;

export function matches(url, html) {
  return /<meta[^>]+content=["']Webflow["'][^>]*>/i.test(html)
      || /website-files\.com/i.test(html)
      || /\.webflow\.io/i.test(url);
}

function hasEventContext(html, url) {
  if (EVENT_CONTEXT_RE.test(url)) return true;
  const $ = load(html);
  const heading = $('h1, h2, h3').filter((_, el) => EVENT_HEADING_RE.test($(el).text())).first();
  return heading.length > 0;
}

export async function extract(html, url) {
  // Structural guard, not a heuristic tiebreaker: without some event-context
  // signal at the page level, no collection item is trusted as an event,
  // no matter what its text looks like — this is what keeps a
  // for-sale-art collection (or a menu, a team-bio collection, etc.) from
  // ever being mistaken for an events calendar.
  if (!hasEventContext(html, url)) return null;

  const $ = load(html);
  const items = $('.w-dyn-item, .collection-item');
  if (!items.length) return null;

  const rows = [];
  items.each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const dateIso = extractDate(text);
    if (!dateIso) return; // no parseable date in this item — not confident enough to call it an event

    const heading = $el.find('h1, h2, h3, h4, [class*="title"], [class*="heading"]').first().text().trim();
    const link = $el.find('a[href]').first().attr('href');
    const title = heading || text.slice(0, 80);
    if (!title) return;

    rows.push({
      title,
      start_time: `${dateIso}T00:00:00`,
      description: text.slice(0, 500),
      source_url: link ? new URL(link, url).toString() : url,
      source_name: new URL(url).hostname,
      confidence_score: 0.45,
      review_status: 'needs_review',
    });
  });

  if (!rows.length) return null;
  return { rows, confidence: 0.45, detectionTier: 'platform_adapter', renderMode: 'http' };
}
