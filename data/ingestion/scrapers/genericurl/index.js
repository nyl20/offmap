// Generic-URL event source scraper. Slots into pipelines/runner.js's
// SCRAPERS array with the same name/envKey/fetchEvents() contract every
// other scraper uses — zero other runner.js changes needed.
//
// Deliberate, explicit exception to "scrapers are pure fetchEvents()": this
// module also reads and writes its own persistent state in `event_sources`
// (via db/eventSources.js), because it's a meta-registry of many
// independently-tracked sources, not a single hardcoded feed — there's
// nowhere else in the existing pipeline shape to hold "is this specific URL
// healthy" across runs. Every other scraper stays exactly as before.

import { getDb } from '../../db/supabase.js';
import { getActiveSources, recordSourceCheck, recomputeSourceHealth } from '../../db/eventSources.js';
import { processSource } from './pipeline.js';

export const name = 'genericurl';
export const envKey = null;

// Hard backstop on LLM spend for a single scrape run, not just a cost
// estimate to trust — once hit, remaining sources are skipped for LLM
// tiers this run (recorded as reasonCode llm_budget_exhausted, not treated
// as a source failure) rather than silently continuing to spend. Every
// call here is plain text (no image/video tokens, unlike per-image Vision
// OCR calls), so in practice this should rarely
// bind — it exists as a ceiling, not an expected steady state.
const MAX_LLM_CALLS_PER_RUN = Number(process.env.GENERICURL_MAX_LLM_CALLS_PER_RUN ?? 100);

function toEventRow(row, source) {
  return {
    title:              row.title,
    description:        row.description ?? null,
    venue_name:         row.venue_name ?? null,
    venue_address:      row.venue_address ?? null,
    venue_address_line: row.venue_address_line ?? null,
    venue_city:         row.venue_city ?? null,
    venue_region:       row.venue_region ?? null,
    venue_postal:       row.venue_postal ?? null,
    venue_country:      row.venue_country ?? null,
    venue_lat:          row.venue_lat ?? null,
    venue_lng:          row.venue_lng ?? null,
    start_time:         row.start_time,
    end_time:           row.end_time ?? null,
    timezone:           row.timezone ?? null,
    category:           row.category ?? null,
    tags:               row.tags ?? [],
    price_text:         row.price_text ?? null,
    is_free:            row.is_free ?? 'false',
    organizer_name:     row.organizer_name ?? null,
    image_url:          row.image_url ?? null,
    ticket_url:         row.ticket_url ?? null,
    external_id:        row.external_id ?? null,
    source_url:         row.source_url ?? source.url,
    source_name:        row.source_name ?? (source.platform ? source.platform : new URL(source.url).hostname),
    confidence_score:   row.confidence_score ?? null,
    review_status:      row.review_status ?? ((row.confidence_score ?? 0) >= 0.7 ? 'candidate' : 'needs_review'),
  };
}

export async function fetchEvents() {
  const db = getDb();
  const sources = await getActiveSources(db);
  const llmBudget = { used: 0, max: MAX_LLM_CALLS_PER_RUN };

  console.log(`[genericurl] checking ${sources.length} active/quiet source(s)`);

  const rows = [];
  for (const source of sources) {
    let result;
    try {
      result = await processSource(source, { llmBudget });
    } catch (err) {
      // A bug in the pipeline itself, not a classified source failure —
      // still recorded as a hard failure (`blocked`) rather than crashing
      // this source's turn and taking the whole run down with it. One
      // source erroring never aborts the others, matching runner.js's
      // existing per-scraper try/catch pattern.
      result = { status: 'failure', reasonCode: 'blocked', message: err.message, rows: [], checkedAt: new Date().toISOString() };
    }

    try {
      await recordSourceCheck(db, source.id, result);
    } catch (err) {
      console.error(`[genericurl] failed to record health for source ${source.id} (${source.url}): ${err.message}`);
    }

    switch (result.status) {
      case 'unchanged':
        console.log(`[genericurl] ${source.url}: unchanged since last check`);
        continue;
      case 'no_signal':
      case 'failure':
        console.warn(`[genericurl] ${source.url}: ${result.status} (${result.reasonCode}) ${result.message ?? ''}`.trim());
        continue;
      case 'extraction_empty':
        console.warn(
          result.reasonCode === 'llm_budget_exhausted'
            ? `[genericurl] ${source.url}: skipped — LLM call budget exhausted for this run`
            : `[genericurl] ${source.url}: extraction_empty — signal present but nothing extracted from any tier`
        );
        continue;
      case 'success_empty':
        console.log(`[genericurl] ${source.url}: reachable, no current events (healthy)`);
        continue;
    }

    console.log(`[genericurl] ${source.url}: ${result.status} via ${result.detectionTier} — ${result.rows.length} row(s)`);
    for (const row of result.rows) rows.push(toEventRow(row, { ...source, platform: result.platform ?? source.platform }));
  }

  try {
    const flipped = await recomputeSourceHealth(db);
    console.log(`[genericurl] recompute_source_health: ${flipped} source(s) transitioned`);
  } catch (err) {
    console.error(`[genericurl] recompute_source_health failed: ${err.message}`);
  }

  return rows;
}
