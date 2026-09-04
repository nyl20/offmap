// The ordered detection chain — cheapest/most-reliable signal first, short-
// circuiting the moment a confident answer is reached. Nothing past this
// module's "no" verdict ever spends a headless render or an LLM call.
//
// Order (see plan): (1) JSON-LD Event markup, (2) known-platform match,
// (3) Event microdata [folded into (1) below — both live in
// extract/deterministic.js since they're the same "does the page already
// tell us structurally" check], (4) generic embedded-state heuristic,
// (5) keyword + date-density heuristic, (6) no signal.

import { load } from 'cheerio';
import { findAdapter } from './adapters/index.js';
import { extractDeterministic } from './extract/deterministic.js';
import { countDateLikeSubstrings, stripToVisibleText } from './extract/trimText.js';

const EVENT_KEYWORD_RE = /\b(events?|calendar|what'?s on|happening|schedule)\b/i;
const STATE_BLOB_NAMES = ['__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__APOLLO_STATE__'];

// Finds a framework hydration-state blob embedded in the page, whichever of
// the common shapes it's in (a dedicated <script id="..."> element, as
// __NEXT_DATA__ always is, or a `window.NAME = {...}` assignment, as some
// Nuxt/custom setups use instead).
export function findStateBlob(html) {
  const $ = load(html);
  for (const id of STATE_BLOB_NAMES) {
    const el = $(`#${id}`);
    if (!el.length) continue;
    try { return { name: id, data: JSON.parse(el.html()) }; } catch { /* try next */ }
  }

  for (const name of STATE_BLOB_NAMES) {
    const marker = `window.${name}`;
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const eq = html.indexOf('=', idx);
    const brace = eq === -1 ? -1 : html.indexOf('{', eq);
    if (brace === -1) continue;
    let depth = 0, end = brace;
    for (let i = brace; i < Math.min(html.length, brace + 500_000); i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    try { return { name, data: JSON.parse(html.slice(brace, end)) }; } catch { continue; }
  }

  return null;
}

// True only when the blob contains an object carrying BOTH a title-ish and
// a date-ish key together — this is exactly what distinguishes "a real
// event record" from a framework shell that merely mentions dates
// somewhere (e.g. Luma's calendar page embeds bare event_start_ats
// timestamps with no titles at all — this correctly returns false for that,
// which is what routes it to the Luma adapter's shadow-API call instead of
// a false "generic extraction found it" claim).
function containsEventRecords(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return false;
  if (Array.isArray(node)) return node.some(n => containsEventRecords(n, depth + 1));

  const keys = Object.keys(node).map(k => k.toLowerCase());
  const hasTitle = keys.includes('name') || keys.includes('title');
  const hasDate = keys.includes('startdate') || keys.includes('start_at') || keys.includes('starttime') || keys.includes('start_time');
  if (hasTitle && hasDate) return true;

  return Object.values(node).some(v => containsEventRecords(v, depth + 1));
}

function pick(obj, keys) {
  for (const k of keys) if (obj[k] != null) return obj[k];
  return null;
}

// Best-effort field mapping across an unknown framework's own naming
// convention. Lower confidence than JSON-LD/microdata (0.75, same as
// microdata per the plan) because it's guessing at field names rather than
// reading a documented vocabulary.
function collectGenericRecords(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6 || out.length > 100) return;
  if (Array.isArray(node)) { node.forEach(n => collectGenericRecords(n, out, depth + 1)); return; }

  const keys = Object.keys(node);
  const lower = Object.fromEntries(keys.map(k => [k.toLowerCase(), k]));
  const titleKey = lower.name ?? lower.title;
  const dateKey = lower.startdate ?? lower.start_at ?? lower.starttime ?? lower.start_time;

  if (titleKey && dateKey && node[titleKey] && node[dateKey]) {
    out.push({
      title: node[titleKey],
      start_time: node[dateKey],
      end_time: pick(node, [lower.enddate, lower.end_at, lower.endtime, lower.end_time].filter(Boolean)),
      description: pick(node, [lower.description, lower.desc].filter(Boolean)),
      image_url: pick(node, [lower.image_url, lower.imageurl, lower.cover_url, lower.image].filter(Boolean)),
      source_url: pick(node, [lower.url, lower.link, lower.source_url].filter(Boolean)),
    });
  } else {
    for (const v of Object.values(node)) collectGenericRecords(v, out, depth + 1);
  }
}

export function extractEmbeddedState(html, url, blob) {
  const out = [];
  collectGenericRecords(blob.data, out);
  const rows = out.map(r => ({ ...r, source_url: r.source_url ?? url }));
  return rows.length ? { rows, confidence: 0.75, detectionTier: 'embedded_state', renderMode: 'http' } : null;
}

export function detectEventSignals(html, url) {
  // Known-platform match is computed up front (cheap, synchronous — matches()
  // only looks at the hostname or an HTML fingerprint, no network call) so it
  // can be compared against JSON-LD below rather than only used when JSON-LD
  // comes up empty. A platform adapter encodes real knowledge of that site's
  // actual data model; generic schema.org JSON-LD is sometimes an
  // intentionally thin SEO summary — verified live against a real Luma
  // calendar page, whose own JSON-LD lists only the single next upcoming
  // event ("numberOfItems":1) while the adapter's shadow-API call recovers
  // the full calendar (6 events, real organizer/price/description). Letting
  // JSON-LD win unconditionally would silently cap every such organizer page
  // at one thin event forever.
  const adapter = findAdapter(url, html);

  // 1. JSON-LD Event markup (schema.org) — also serves as tier-1 extraction if it hits.
  const deterministic = extractDeterministic(html, url);
  if (deterministic) {
    return { verdict: 'yes', confidence: deterministic.confidence, tier: deterministic.detectionTier, matchedAdapter: adapter, deterministic };
  }

  // 2. Known-platform match — delegate to the adapter's own judgment; its
  // extract() call happens later in pipeline.js, not here, since some
  // adapters (Luma's calendar path) need an extra network call to confirm.
  if (adapter) {
    return { verdict: 'maybe', confidence: 0.6, tier: 'platform_adapter', matchedAdapter: adapter };
  }

  // 4. Generic embedded-state heuristic.
  const blob = findStateBlob(html);
  if (blob) {
    if (containsEventRecords(blob.data)) {
      return { verdict: 'yes', confidence: 0.75, tier: 'embedded_state', matchedAdapter: null, stateBlob: blob };
    }
    // Blob present but no event-shaped records inside — present state, no
    // usable data. Not a "no" (the app is clearly a real SPA that might
    // still list events after further rendering), but not a confident "yes"
    // either — this is the specific condition the render-escalation
    // decision checks for.
    return { verdict: 'maybe', confidence: 0.3, tier: 'none', matchedAdapter: null, stateBlobWithoutEvents: true };
  }

  // 5. Keyword + date-density heuristic on visible text.
  const text = stripToVisibleText(html);
  const dateCount = countDateLikeSubstrings(text);
  const hasEventKeyword = EVENT_KEYWORD_RE.test(text) || EVENT_KEYWORD_RE.test(url);
  if (hasEventKeyword && dateCount >= 2) {
    return { verdict: 'maybe', confidence: 0.4, tier: 'none', matchedAdapter: null };
  }

  // 6. No signal at any tier — stop here. Never spend a headless render or
  // an LLM call on a flat "no".
  return { verdict: 'no', confidence: 0.9, tier: 'none', matchedAdapter: null };
}
