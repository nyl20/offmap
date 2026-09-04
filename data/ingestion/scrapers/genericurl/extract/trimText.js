// Shared HTML → trimmed-text helper for the LLM extraction tiers, and for
// the date-density cross-check validate.js uses to decide whether to
// escalate. Never sends raw HTML to a model — script/style/nav/footer noise
// wastes input tokens and adds nothing an LLM needs to find event text.

import { load } from 'cheerio';

// Deliberately loose — this only needs to catch "text that looks date-ish"
// for trimming/counting purposes, not to fully parse a date (extractDate()
// in ../../utils.js does that, more strictly, downstream in validate.js).
//
// Bare weekday names ("Mon"/"Fri"/"Sun") are deliberately EXCLUDED, even
// though a real event listing often includes one — verified live against
// bibliothequenyc.com, whose posted hours ("Sun to Thu: 10am-10pm / Fri &
// Sat: 10am-11pm") matched a weekday-name pattern seven times on a page
// with zero actual events, which would have misclassified a healthy,
// eventless site as a extraction failure. A weekday name only counts here
// when it's adjacent to an actual day-of-month number or a month name —
// operating-hours text virtually never has that, real event dates almost
// always do.
const DATE_LIKE_RE = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,.]?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}|today|tomorrow|tonight)\b/gi;

// cheerio's .text() concatenates adjacent block elements' text with no
// separator at all when the source HTML has no whitespace between tags
// (common in minified/compiled output, e.g. Webflow) — verified live:
// "...Pre-order</div><div>MAYBE LATER</div><div>54 Mercer Street..." came
// back as "...Pre-orderMAYBE LATER54 Mercer Street...", gluing a price
// callout, a button label, and a street address into one unbroken run of
// word characters. That silently breaks any regex relying on \b word
// boundaries (an address-detection regex looking for a digit at a word
// boundary never found "54" glued to "LATER"), and degrades every
// downstream text-based tier reading this output. Appending a space after
// each block-level element before extracting text is the standard fix.
const BLOCK_LEVEL_SELECTOR = 'p, div, li, h1, h2, h3, h4, h5, h6, tr, td, br, section, article, ul, ol';

export function stripToVisibleText(html) {
  const $ = load(html);
  $('script, style, noscript, svg, nav, footer, header').remove();
  $(BLOCK_LEVEL_SELECTOR).append(' ');
  return $('body').text().replace(/\s+/g, ' ').trim();
}

export function countDateLikeSubstrings(text) {
  const matches = text.match(DATE_LIKE_RE);
  return matches ? matches.length : 0;
}

// Prioritizes text *around* date-like substrings over a naive head-of-
// document truncation — a long nav/hero section otherwise pushes the real
// event listing past maxChars before it's ever seen.
export function trimPageText(html, { maxChars = 6000, windowChars = 300 } = {}) {
  const full = stripToVisibleText(html);
  if (full.length <= maxChars) return full;

  const windows = [];
  let m;
  DATE_LIKE_RE.lastIndex = 0;
  while ((m = DATE_LIKE_RE.exec(full))) {
    windows.push([Math.max(0, m.index - windowChars / 2), Math.min(full.length, m.index + windowChars / 2)]);
  }
  if (!windows.length) return full.slice(0, maxChars);

  windows.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of windows) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  let out = '';
  for (const [s, e] of merged) {
    if (out.length >= maxChars) break;
    out += (out ? ' … ' : '') + full.slice(s, e);
  }
  return out.slice(0, maxChars);
}
