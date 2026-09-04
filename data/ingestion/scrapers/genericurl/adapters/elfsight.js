// Elfsight "Event Calendar" widget adapter.
//
// Elfsight is a popular no-code widget-embed platform used by many small
// business sites (cafes, bars, galleries — exactly the long-tail venues
// this pipeline targets) to add an events section without custom
// development. The widget renders client-side from an empty placeholder
// div (`<div class="elfsight-app-<uuid>" data-elfsight-app-lazy></div>`) —
// a plain fetch sees nothing inside it, which is why a page with a real,
// actively-maintained events section can still look event-less to the
// generic detection chain. But Elfsight's own loader script fetches its
// content from a public, unauthenticated JSON endpoint:
//   https://core.service.elfsight.com/p/boot/?page=<pageUrl>&w=<widgetId>
// which returns the widget's full configured content — no headless
// rendering needed, same category of win as Luma's shadow API.
//
// Discovered and verified live against bibliothequenyc.com after a real
// false negative was reported: its homepage (not a separate /events route)
// embeds exactly this widget, and the boot endpoint returned 105 real
// events with titles, ISO dates/times, timezones, full descriptions, and
// real Resy/ticketing links.
//
// Elfsight hosts many widget types (reviews, Instagram feeds, etc.) behind
// this same placeholder/boot-endpoint pattern, distinguished by the
// widget's own `app` field — extract() only trusts `app === 'event-calendar'`
// and returns null for anything else, rather than assuming every Elfsight
// embed on a page is an events calendar.

import { fetchJson } from '../fetchRaw.js';

export const platform = 'elfsight';

const WIDGET_ID_RE = /elfsight-app-([0-9a-f-]{20,40})/gi;

export function matches(url, html) {
  return /elfsight/i.test(html);
}

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeEvent(e, pageUrl) {
  if (!e?.name?.trim() || !e?.start?.date) return null;

  const startIso = e.start.time ? `${e.start.date}T${e.start.time}:00` : `${e.start.date}T00:00:00`;
  const start = new Date(startIso);
  if (isNaN(start)) return null;

  const endIso = e.end?.date
    ? (e.end.time ? `${e.end.date}T${e.end.time}:00` : `${e.end.date}T23:59:59`)
    : null;
  const end = endIso ? new Date(endIso) : null;

  // Elfsight event-calendar entries carry no location field at all
  // (verified live — always `"location":[]`) — venue_name/address are left
  // null here and backfilled generically in pipeline.js from the site's
  // own posted address, when it has one, rather than guessed here.
  const primaryAction = (e.actions ?? []).find(a => a.link?.rawValue);

  return {
    title: e.name.trim(),
    external_id: e.id ?? null,
    start_time: start.toISOString(),
    end_time: end && !isNaN(end) ? end.toISOString() : null,
    timezone: e.timeZone ?? null,
    description: stripHtml(e.description).slice(0, 1000) || null,
    ticket_url: primaryAction?.link?.rawValue ?? null,
    image_url: e.images?.[0]?.url ?? null,
    source_url: primaryAction?.link?.rawValue ?? pageUrl,
    source_name: 'Elfsight',
    confidence_score: 0.85,
    review_status: 'candidate',
  };
}

export async function extract(html, url) {
  const widgetIds = [...new Set([...html.matchAll(WIDGET_ID_RE)].map(m => m[1]))];
  if (!widgetIds.length) return null;

  const rows = [];
  for (const widgetId of widgetIds) {
    const endpoint = `https://core.service.elfsight.com/p/boot/?page=${encodeURIComponent(url)}&w=${widgetId}`;
    const { ok, data: bootJson } = await fetchJson(endpoint);
    if (!ok || !bootJson) continue;

    const widget = bootJson.data?.widgets?.[widgetId];
    if (widget?.data?.app !== 'event-calendar') continue; // a different Elfsight widget type — not an events calendar

    const events = widget.data.settings?.events ?? [];
    for (const e of events) {
      const row = normalizeEvent(e, url);
      if (row) rows.push(row);
    }
  }

  return rows.length ? { rows, confidence: 0.85, detectionTier: 'platform_adapter', renderMode: 'shadow_api' } : null;
}
