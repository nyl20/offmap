// Luma adapter — highest-confidence, lowest-cost adapter in this pipeline.
//
// Verified live against https://luma.com/karo?period=past (the hard example
// from the brief): a plain fetch returns __NEXT_DATA__ with
// props.pageProps.initialData.data.calendar.api_id, and Luma's own frontend
// reads that calendar via a public, unauthenticated JSON endpoint:
//   https://api.lu.ma/calendar/get-items?calendar_api_id=<id>&period=<period>
// That endpoint returns full structured event data (title, start/end,
// timezone, geo, cover image, slug) with zero headless rendering needed —
// a second plain fetch is the entire cost. Confirmed the response's wrapper
// key is `entries` and each entry is a sibling structure alongside `event`:
// `{ event, ticket_info, hosts, tags, ... }` — ticket_info.is_free/price and
// hosts[0].name/bio_short are real, populated fields worth reading.
//
// The existing scrapers/luma.js targets a different page shape (the
// unauthenticated city-feed page, data.events directly, no `kind` field) —
// this adapter targets an arbitrary individual calendar/host page instead
// (`kind: "calendar"`), which is what a per-venue Luma URL actually is.
//
// IMPORTANT: a genuine single-event page (e.g. https://lu.ma/vxy68ea3) also
// embeds its host's pageData.calendar.api_id (every Luma event page carries
// its calendar) — so the calendar check MUST run after the single-event
// check below, or a single-event URL silently gets classified as its whole
// host calendar instead. Verified live: single-event pages carry a real
// per-event description at pageData.description_mirror (a ProseMirror doc);
// calendar-derived entries have no description field at all, so those fall
// back to the host's bio_short instead.

import { load } from 'cheerio';
import { fetchJson } from '../fetchRaw.js';

export const platform = 'luma';

export function matches(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'luma.com' || host === 'www.luma.com' || host === 'lu.ma';
  } catch {
    return false;
  }
}

function extractNextData(html) {
  const $ = load(html);
  const el = $('#__NEXT_DATA__');
  if (!el.length) return null;
  try { return JSON.parse(el.html()); } catch { return null; }
}

// pageData.description_mirror is a ProseMirror doc: { content: [{ type:
// 'paragraph', content: [{ type: 'text', text }] }] }. Only single-event
// pages carry this — calendar-derived entries have no description at all.
function flattenDescriptionMirror(doc) {
  if (!doc?.content) return null;
  const lines = doc.content
    .map(block => (block.content ?? []).map(node => node.text ?? '').join(''))
    .filter(line => line.length);
  return lines.length ? lines.join('\n\n') : null;
}

function formatPrice(ticketInfo) {
  if (!ticketInfo || ticketInfo.is_free) return null;
  const cents = ticketInfo.price?.cents;
  const currency = ticketInfo.price?.currency;
  if (cents == null || !currency) return null;
  const amount = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  return currency.toUpperCase() === 'USD' ? `$${amount}` : `${amount} ${currency.toUpperCase()}`;
}

// `entry` is the sibling structure surrounding an event record — { event,
// ticket_info, hosts, tags, ... } for calendar/city-feed entries. A bare
// single-event page has no such wrapper, so callers pass { event: e,
// ticket_info: pageData.ticket_info, hosts: pageData.hosts, description }.
function normalizeEvent(entry, sourceUrl, { description } = {}) {
  const e = entry?.event ?? entry;
  if (!e?.name || !e?.start_at) return null;

  const start = new Date(e.start_at);
  const end   = e.end_at ? new Date(e.end_at) : null;
  if (isNaN(start)) return null;

  const coord = e.coordinate;
  const lat   = coord?.latitude  ? parseFloat(coord.latitude)  : null;
  const lng   = coord?.longitude ? parseFloat(coord.longitude) : null;

  const geo  = e.geo_address_info;
  const addr = geo?.full_address ?? geo?.city_state ?? geo?.city ?? null;

  const eventUrl = e.url
    ? (e.url.startsWith('http') ? e.url : `https://lu.ma/${e.url}`)
    : (e.api_id ? `https://lu.ma/${e.api_id}` : sourceUrl);

  const ticketInfo = entry?.ticket_info ?? null;
  const host = entry?.hosts?.[0] ?? null;

  return {
    title:         e.name,
    external_id:   e.api_id ?? null,
    venue_name:    geo?.sublocality ?? geo?.city ?? null,
    venue_address: addr,
    venue_city:    geo?.city ?? null,
    venue_region:  geo?.region_short ?? geo?.region ?? null,
    venue_country: geo?.country_code ?? null,
    venue_lat:     lat,
    venue_lng:     lng,
    start_time:    start.toISOString(),
    end_time:      end && !isNaN(end) ? end.toISOString() : null,
    timezone:      e.timezone ?? null,
    category:      null,
    tags:          entry?.tags ?? [],
    description:   description ?? host?.bio_short ?? null,
    organizer_name: host?.name ?? null,
    price_text:    formatPrice(ticketInfo),
    is_free:       ticketInfo?.is_free ?? false,
    image_url:     e.cover_url ?? null,
    venue_website_url: host?.website ?? null,
    venue_image_url:   host?.avatar_url ?? null,
    venue_description: host?.bio_short ?? null,
    source_url:    eventUrl,
    source_name:   'Luma',
    confidence_score: 0.9,
    review_status: 'candidate',
  };
}

// A calendar/host page (__NEXT_DATA__.props.pageProps.initialData.data.calendar)
// only carries metadata + bare event_start_ats in the initial HTML — the
// actual event records live behind the shadow API, keyed by calendar_api_id.
async function extractFromCalendarApiId(apiId, sourceUrl) {
  const periods = ['future', 'past'];
  const rows = [];
  const seen = new Set();

  for (const period of periods) {
    const endpoint = `https://api.lu.ma/calendar/get-items?calendar_api_id=${encodeURIComponent(apiId)}&period=${period}&pagination_limit=50`;
    const { ok, data } = await fetchJson(endpoint);
    if (!ok || !data) continue;

    // Defensive: the exact wrapper key hasn't been confirmed for every
    // account type — try the shapes Luma's other endpoints are known to use.
    // Confirmed live against a real calendar: it's `entries`.
    const entries = data.entries ?? data.items ?? data.calendar_events ?? [];
    for (const entry of entries) {
      const row = normalizeEvent(entry, sourceUrl);
      if (!row || seen.has(row.external_id ?? row.source_url)) continue;
      seen.add(row.external_id ?? row.source_url);
      rows.push(row);
    }

    // has_more beyond pagination_limit is a real gap, not a guessed cursor
    // param worth risking — surface it in logs instead of silently dropping.
    if (data.has_more) {
      console.warn(`[luma-adapter] calendar ${apiId} has more than pagination_limit events in period=${period} — some may be missing`);
    }
  }

  return rows;
}

export async function extract(html, url) {
  const data = extractNextData(html);
  if (!data) return null;

  const pageData = data?.props?.pageProps?.initialData?.data;
  if (!pageData) return null;

  // City/discovery-feed shape (e.g. luma.com/nyc) — events embedded directly.
  if (Array.isArray(pageData.events) && pageData.events.length) {
    const rows = pageData.events
      .map(entry => normalizeEvent(entry, url))
      .filter(Boolean);
    return rows.length ? { rows, confidence: 0.9, detectionTier: 'platform_adapter', renderMode: 'http' } : null;
  }

  // Single-event page — checked BEFORE the calendar branch below. A single
  // event page also embeds its host's pageData.calendar.api_id (every Luma
  // event carries its calendar), so checking calendar first would swallow
  // every single-event URL into a full calendar dump instead. This branch
  // gets the richer per-event data a calendar entry doesn't have: a real
  // description (description_mirror) plus top-level ticket_info/hosts.
  const singleEvent = pageData.event;
  if (singleEvent) {
    const entry = { event: singleEvent, ticket_info: pageData.ticket_info, hosts: pageData.hosts };
    const description = flattenDescriptionMirror(pageData.description_mirror);
    const row = normalizeEvent(entry, url, { description });
    return row
      ? { rows: [row], confidence: 0.9, detectionTier: 'platform_adapter', renderMode: 'http' }
      : null;
  }

  // Individual calendar/host page — resolve via the shadow API.
  const calendarApiId = pageData.calendar?.api_id;
  if (calendarApiId) {
    const rows = await extractFromCalendarApiId(calendarApiId, url);
    return { rows, confidence: rows.length ? 0.9 : 0.6, detectionTier: 'platform_adapter', renderMode: 'shadow_api' };
  }

  return null;
}
