// Confidence scoring and validation — the gate that decides "is this tier's
// output good enough to stop" vs "escalate to the next tier". Applied
// identically regardless of which tier produced the rows (deterministic,
// adapter, or LLM) so no tier gets a free pass on plausibility just because
// it's cheap, and no tier gets penalized just because it's expensive.

import { countDateLikeSubstrings } from './extract/trimText.js';

function withinPlausibleRange(d) {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoYearsOut  = now + 2 * 365 * 24 * 60 * 60 * 1000;
  return d.getTime() >= sevenDaysAgo && d.getTime() <= twoYearsOut;
}

function isPlausibleDate(value) {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d) && withinPlausibleRange(d);
}

function hasLocationSignal(row) {
  return Boolean(row.venue_name || row.venue_address || (row.venue_lat != null && row.venue_lng != null));
}

const OFFSET_OR_Z_RE = /[+-]\d{2}:?\d{2}$|Z$/;

function scoreRow(row, baseConfidence) {
  let score = baseConfidence;
  if (!row.venue_address && !row.venue_name) score -= 0.15;
  if (!row.description) score -= 0.10;
  if (!row.timezone && !OFFSET_OR_Z_RE.test(String(row.start_time))) score -= 0.20;
  return Math.max(0.3, Math.min(1, score));
}

// `text` is the trimmed/stripped page text this tier worked from — used
// only for the date-density cross-check, never re-parsed for fields.
export function scoreExtraction(rows, { text, baseConfidence = 0.5 } = {}) {
  const reasonCodes = [];
  const valid = [];

  for (const row of rows ?? []) {
    if (!row?.title?.trim()) { reasonCodes.push('missing_title'); continue; }
    if (!isPlausibleDate(row.start_time)) { reasonCodes.push('unparseable_or_implausible_date'); continue; }
    if (!hasLocationSignal(row)) { reasonCodes.push('missing_location'); continue; }
    valid.push({ ...row, confidence_score: scoreRow(row, row.confidence_score ?? baseConfidence) });
  }

  const dateLikeCount = text ? countDateLikeSubstrings(text) : 0;
  // A big gap between "dates visibly present in the text" and "rows we
  // actually extracted" signals an incomplete extraction, not "nothing to
  // find here" — this is what drives escalation even when a tier returned
  // *something*, not just when it returned nothing.
  const gapDetected = dateLikeCount >= 3 && valid.length <= 1;

  const confidence = valid.length
    ? valid.reduce((sum, r) => sum + r.confidence_score, 0) / valid.length
    : 0;

  return { rows: valid, confidence, reasonCodes, dateLikeCount, gapDetected };
}

// The single stop/escalate rule: clear the bar, or keep going.
export function passesConfidenceBar(scored) {
  return scored.rows.length > 0 && scored.confidence >= 0.5 && !scored.gapDetected;
}

// True when a tier rejected every row for being outside the plausible date
// window and for no other reason (not missing a title, not missing a
// location). Verified live against a real Luma calendar page: the shadow
// API adapter reliably found real, well-formed event records that simply
// had no occurrences in the next two years' window (period=past query,
// nothing upcoming currently listed) — escalating to an LLM read of the
// same page's rendered text in that situation can't discover events the
// structured source didn't mention, so a confident structured/adapter tier
// rejected only on date plausibility should be trusted as "genuinely
// nothing current" rather than triggering an LLM call that can't help.
export function rejectedOnlyForStaleDates(scored) {
  return scored.rows.length === 0
    && scored.reasonCodes.length > 0
    && scored.reasonCodes.every(c => c === 'unparseable_or_implausible_date');
}
