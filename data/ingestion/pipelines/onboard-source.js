// CLI entry point for `node pipelines/onboard-source.js <url>`.
//
// Runs the same detect -> extract -> validate pipeline as the recurring
// genericurl scraper, but ONCE, against a brand-new candidate URL, and
// prints what it found. On a quality bar (>=1 valid row, average confidence
// >=0.6) it saves the URL into event_sources — always as 'candidate', never
// 'active' — so a human decides whether to actually start checking it on
// the nightly schedule (see supabase/reviews/event_sources_review.sql).
// This is deliberately a separate entry point from genericurl/index.js's
// fetchEvents(): onboarding a URL and re-checking an already-trusted one
// are different operations with different consequences for getting it
// wrong (a bad onboard just doesn't get saved; a bad recurring check could
// otherwise silently insert junk into the daily pipeline).

import 'dotenv/config';
import { getDb } from '../db/supabase.js';
import { getSourceByUrl, insertSource } from '../db/eventSources.js';
import { processSource } from '../scrapers/genericurl/pipeline.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node pipelines/onboard-source.js <url>');
  process.exit(1);
}

const db = getDb();

const existing = await getSourceByUrl(db, url);
if (existing) {
  console.log(`Already onboarded — status '${existing.status}', last checked ${existing.last_checked_at ?? 'never'}.`);
  console.log(`See supabase/reviews/event_sources_review.sql to change its status.`);
  process.exit(0);
}

console.log(`Checking ${url}…`);
const result = await processSource({ url, render_mode: 'http' }, { llmBudget: { used: 0, max: 10 } });

console.log(`\nResult: ${result.status}${result.reasonCode ? ` (${result.reasonCode})` : ''}`);
console.log(`Detection tier: ${result.detectionTier ?? 'n/a'}, render mode: ${result.renderMode ?? 'n/a'}`);
console.log(`Rows found: ${result.rows?.length ?? 0}`);

if (result.rows?.length) {
  for (const row of result.rows.slice(0, 5)) {
    const price = row.is_free ? 'free' : (row.price_text ?? 'paid, price unknown');
    console.log(`  - "${row.title}" @ ${row.start_time} (${row.venue_name ?? 'no venue'}) by ${row.organizer_name ?? 'unknown organizer'}, ${price}, confidence=${(row.confidence_score ?? 0).toFixed(2)}`);
  }
  if (result.rows.length > 5) console.log(`  … and ${result.rows.length - 5} more`);
}

const avgConfidence = result.rows?.length
  ? result.rows.reduce((sum, r) => sum + (r.confidence_score ?? 0), 0) / result.rows.length
  : 0;
const meetsQualityBar = (result.rows?.length ?? 0) >= 1 && avgConfidence >= 0.6;

if (!meetsQualityBar) {
  console.log(
    `\nDoes not meet the quality bar for saving (needs >=1 row and average confidence >=0.6; got ` +
    `${result.rows?.length ?? 0} row(s) at ${avgConfidence.toFixed(2)}). Not saved — nothing was written.`
  );
  process.exit(0);
}

const source = await insertSource(db, { url });
console.log(`\nSaved as event_sources.id=${source.id}, status='candidate'.`);
console.log(`It will NOT be checked by the nightly scraper until promoted to 'active' — see supabase/reviews/event_sources_review.sql.`);
