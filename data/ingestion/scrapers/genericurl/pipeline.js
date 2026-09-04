// Orchestrates one source end-to-end: cache/diff short-circuit -> detect ->
// deterministic/adapter extraction -> render-escalation check -> LLM
// tiers (budget-permitting) -> validate. Every exit point returns a
// `status` + (when relevant) a `reasonCode` — callers (genericurl/index.js,
// pipelines/onboard-source.js) translate that into event_sources health
// updates. Nothing in here ever fabricates a row: every path either returns
// validated rows or an explicit empty/failure result.

import { fetchHtml } from './fetchRaw.js';
import { detectEventSignals, extractEmbeddedState } from './detectSignals.js';
import { needsHeadlessRender, renderHeadless } from './renderDecision.js';
import { trimPageText, stripToVisibleText } from './extract/trimText.js';
import { extractWithSmallLLM } from './extract/llmSmall.js';
import { extractWithLargeLLM } from './extract/llmLarge.js';
import { scoreExtraction, passesConfidenceBar, rejectedOnlyForStaleDates } from './validate.js';
import { hashPlainText } from './contentHash.js';
import { findAddressInText, findSiteNameFromTitle } from './extract/siteAddress.js';

// Reason codes that do NOT count against a source's consecutive_failure_count
// — they reflect a pipeline limitation or a quality signal, not the source
// being unreachable/broken. Kept alongside processSource() since these are
// exactly the statuses it can produce, not a general-purpose enum.
export const SOFT_REASON_CODES = new Set(['llm_budget_exhausted', 'render_unsupported', null]);

function classifyHttpFailure(status) {
  if (status === 403 || status === 429) return 'blocked';
  return 'not_found'; // 404/410/5xx/anything else non-2xx — conservative default
}

async function tryDeterministicOrAdapter(html, url, detection) {
  // A matched platform adapter is tried whenever one exists, even when
  // JSON-LD/microdata also matched — a specific adapter knows the site's
  // actual data model (e.g. Luma's shadow API returns a whole calendar) and
  // generic JSON-LD can be a deliberately thin SEO summary. The adapter's
  // result wins only if it's at least as complete as the deterministic
  // tier's, so this can only match or improve on today's row count, never
  // regress it — verified live: karo's own JSON-LD lists exactly 1 event,
  // the Luma adapter's shadow-API call recovers all 6.
  if (detection.matchedAdapter) {
    const adapterResult = await detection.matchedAdapter.extract(html, url);
    if (adapterResult && (!detection.deterministic || adapterResult.rows.length >= detection.deterministic.rows.length)) {
      return { ...adapterResult, platform: detection.matchedAdapter.platform };
    }
  }

  if (detection.deterministic) return detection.deterministic;

  if (detection.tier === 'embedded_state' && detection.stateBlob) {
    const result = extractEmbeddedState(html, url, detection.stateBlob);
    if (result) return result;
  }

  return null;
}

export async function processSource(sourceRow, { llmBudget = { used: 0, max: 100 } } = {}) {
  const url = sourceRow.url;
  const checkedAt = new Date().toISOString();

  let fetched;
  try {
    fetched = await fetchHtml(url);
  } catch (err) {
    return { status: 'failure', reasonCode: 'blocked', message: err.message, rows: [], checkedAt };
  }

  if (!fetched.ok) {
    return { status: 'failure', reasonCode: classifyHttpFailure(fetched.status), message: `HTTP ${fetched.status}`, rows: [], checkedAt };
  }

  const { html, finalUrl } = fetched;
  const visibleText = stripToVisibleText(html);
  const contentHash = hashPlainText(visibleText);

  // Backfills venue_name/venue_address from the site's own posted address
  // when a tier found real events but no location at all — most notably
  // the Elfsight event-calendar adapter, whose records carry no location
  // field whatsoever (verified live). Reads only what the page itself
  // already prints; never invents one. MUST run before scoreExtraction()
  // sees these rows — validate.js's location check rejects a row outright
  // for missing venue_name/venue_address, so backfilling after scoring
  // would be too late to save an otherwise-valid row (this was a real bug,
  // caught by testing against a live Elfsight-powered site: 105 real,
  // well-formed events were all discarded as "missing_location" before the
  // backfill was moved here).
  function backfillLocation(rows) {
    const needsAddress = rows.some(r => !r.venue_address);
    const needsName = rows.some(r => !r.venue_name);
    if (!needsAddress && !needsName) return rows;
    const fallbackAddress = needsAddress ? findAddressInText(visibleText) : null;
    const fallbackName = needsName ? findSiteNameFromTitle(html) : null;
    if (!fallbackAddress && !fallbackName) return rows;
    return rows.map(r => ({
      ...r,
      venue_address: r.venue_address ?? fallbackAddress,
      venue_name: r.venue_name ?? fallbackName,
    }));
  }

  // Cache/diff short-circuit, before detection ever runs. Scoped to
  // render_mode='http' sources, where the fetched page IS the data (true
  // for JSON-LD/microdata/embedded-state/Webflow pages, and for
  // Eventbrite/Partiful's embedded-JSON pages). A source running through
  // Luma's shadow-API path is deliberately excluded here — its page shell
  // is close to static from one day to the next even when the underlying
  // calendar data changes, so hashing the page text would wrongly skip real
  // updates; those sources always proceed to a fresh (still cheap) shadow-
  // API call instead, and are only diffed by their event count/dates
  // downstream via last_event_seen_at.
  if (sourceRow.render_mode === 'http' && sourceRow.last_content_hash === contentHash) {
    return { status: 'unchanged', rows: [], checkedAt, contentHash, renderMode: 'http', platform: sourceRow.platform ?? null };
  }

  const detection = detectEventSignals(html, finalUrl);

  if (detection.verdict === 'no') {
    return { status: 'no_signal', reasonCode: 'no_signal', rows: [], checkedAt, detectionTier: 'none', contentHash };
  }

  // Tier 1: deterministic (JSON-LD/microdata/embedded-state) or platform
  // adapter — all free, all tried before anything more expensive.
  let tier1 = await tryDeterministicOrAdapter(html, finalUrl, detection);
  let scored = tier1 ? scoreExtraction(backfillLocation(tier1.rows), { text: visibleText, baseConfidence: tier1.confidence }) : null;
  let detectionTier = tier1?.detectionTier ?? detection.tier;
  let renderMode = tier1?.renderMode ?? 'http';
  const platform = tier1?.platform ?? detection.matchedAdapter?.platform ?? null;

  // A reliable structured/adapter source that found real, well-formed
  // records rejected ONLY for being outside the plausible date window (not
  // for a missing title/location) has already given a confident answer:
  // "nothing current." An LLM read of the same page's rendered text can't
  // discover events the structured source didn't mention, so there's
  // nothing to gain by escalating — verified live against a real Luma
  // calendar page during implementation (see validate.js).
  if (tier1?.rows?.length && scored && rejectedOnlyForStaleDates(scored)) {
    return { status: 'success_empty', reasonCode: null, rows: [], checkedAt, detectionTier, contentHash, renderMode, platform };
  }

  // Render escalation only even considered once tier 1 has already failed
  // to clear the bar and detection itself was never confident either way.
  if (!scored || !passesConfidenceBar(scored)) {
    const renderCheck = needsHeadlessRender(html, detection);
    if (renderCheck.needed) {
      try {
        await renderHeadless(url);
      } catch (err) {
        return {
          status: 'failure',
          reasonCode: err.reasonCode ?? 'render_failed',
          message: err.message,
          rows: [],
          checkedAt,
          detectionTier,
          contentHash,
        };
      }
    }
  }

  // Tiers 2/3: LLM extraction on trimmed text, only on a concrete
  // validation failure/gap, and only within this run's shared LLM budget —
  // once exhausted, remaining sources are skipped for this run rather than
  // silently continuing to spend (see genericurl/index.js).
  if (!scored || !passesConfidenceBar(scored)) {
    if (llmBudget.used >= llmBudget.max) {
      return {
        status: scored?.rows.length ? 'low_confidence' : 'extraction_empty',
        reasonCode: 'llm_budget_exhausted',
        rows: scored?.rows ?? [],
        checkedAt,
        detectionTier,
        contentHash,
        renderMode,
        platform,
      };
    }

    const smallText = trimPageText(html, { maxChars: 6000 });
    llmBudget.used++;
    const smallRows = await extractWithSmallLLM(smallText, finalUrl).catch(() => []);
    const smallScored = scoreExtraction(backfillLocation(smallRows), { text: smallText, baseConfidence: 0.6 });

    if (passesConfidenceBar(smallScored)) {
      scored = smallScored;
      detectionTier = 'llm_small';
    } else if (smallScored.dateLikeCount >= 2 && llmBudget.used < llmBudget.max) {
      const largeText = trimPageText(html, { maxChars: 20_000 });
      llmBudget.used++;
      const largeRows = await extractWithLargeLLM(largeText, finalUrl).catch(() => []);
      const largeScored = scoreExtraction(backfillLocation(largeRows), { text: largeText, baseConfidence: 0.5 });
      const largeIsBetter = largeScored.rows.length >= smallScored.rows.length;
      scored = largeIsBetter ? largeScored : smallScored;
      detectionTier = largeIsBetter ? 'llm_large' : 'llm_small';
    } else {
      scored = smallScored;
      detectionTier = 'llm_small';
    }
    renderMode = 'http';
  }

  if (!scored || !scored.rows.length) {
    // Only treat a fully-empty result as a hard failure when there was
    // real reason to expect otherwise: either detection started with a
    // confident 'yes' (real JSON-LD/microdata/embedded-state event records
    // existed at the top of the pipeline), or the final tier's text shows a
    // clear gap (>=3 date-like substrings, nothing extracted from any
    // tier). Every other empty result — a merely-'maybe' verdict (a matched
    // platform whose own adapter found no event context, a state blob with
    // no real records, the generic keyword heuristic) that never pans out —
    // is classified as healthy, not broken. Observed live on an early
    // version of this pipeline (before the Elfsight adapter existed): a
    // Webflow platform match plus an unrelated nav link's text ("Private
    // Events") and incidental date-like tokens elsewhere on a page can
    // carry it through every tier even when that specific page turns out
    // to have no extractable events. Counting that as a hard failure would
    // eventually flip a permanently-quiet, perfectly healthy site to
    // 'broken' after 5 daily checks for no real reason.
    const strongInitialSignal = detection.verdict === 'yes';
    const clearGapInFinalText = (scored?.dateLikeCount ?? 0) >= 3;
    const genuinelyEmpty = !strongInitialSignal && !clearGapInFinalText;
    return {
      status: genuinelyEmpty ? 'success_empty' : 'extraction_empty',
      reasonCode: genuinelyEmpty ? null : 'extraction_empty',
      rows: [],
      checkedAt,
      detectionTier,
      contentHash,
      renderMode,
      platform,
    };
  }

  return {
    status: scored.confidence >= 0.5 ? 'success' : 'low_confidence',
    reasonCode: scored.confidence >= 0.5 ? null : 'low_confidence',
    rows: scored.rows,
    checkedAt,
    detectionTier,
    contentHash,
    renderMode,
    platform,
  };
}
