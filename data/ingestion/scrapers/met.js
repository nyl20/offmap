// The Metropolitan Museum of Art — NOT YET IMPLEMENTED
//
// Why: the entire www.metmuseum.org domain sits behind Vercel's BotID
// checkpoint, not just /events. Confirmed 429 with x-vercel-mitigated:
// challenge on /events, /exhibitions, /, /robots.txt, and /sitemap.xml —
// from two independent networks. It's a JS-execution/proof-of-work
// challenge (the response body is an obfuscated JS solver), not a
// UA/header/IP-reputation check, so no plain HTTP client — curl,
// node-fetch, fetch — can pass it in principle. Only something that
// actually executes JS (a real browser, or a headless one) gets through.
// Don't re-try other metmuseum.org paths expecting a different result.
//
// collectionapi.metmuseum.org (the public Collections API, docs at
// https://metmuseum.github.io/) is reachable and unprotected, but it only
// covers artwork/object metadata — no exhibitions or events data.
// api./calendar./events.metmuseum.org don't resolve; there's no
// unprotected subdomain serving this data.
//
// Third-party alternatives were also checked and rejected: newyorktickets.com
// has a "Met Exhibitions" page reachable with a plain fetch, but its content
// is ~2 years stale (dates shown as current were from 2024) — an SEO/affiliate
// page, not a maintained feed. Google Arts & Culture's Met partner page is
// virtual-gallery content, not a current-exhibitions calendar. Wikipedia and
// editorial roundups only have occasional unstructured mentions of specific
// shows, with no reliable update cadence.
//
// Path forward: a headless browser (Playwright/Puppeteer) capable of
// executing the challenge JS is the only way to get live data from this
// domain, or wait for Met to expose a public events/exhibitions API.

export const name   = 'met';
export const envKey = null;

export async function fetchEvents() {
  console.warn('[met] not yet implemented — see src/scrapers/met.js for details');
  return [];
}
