import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { getDb } from '../db/supabase.js';
import { upsertVenue, insertEvent, classifyRow } from '../db/funnel.js';

// Required CSV columns
const REQUIRED_FIELDS = ['title', 'venue_name', 'venue_address', 'start_time', 'source_url'];

function validateRow(row) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || String(row[field]).trim() === '') {
      errors.push(`missing required field "${field}"`);
    }
  }

  // Validate start_time is parseable
  if (row.start_time && isNaN(Date.parse(row.start_time))) {
    errors.push(`start_time "${row.start_time}" is not a valid date`);
  }

  // Basic URL check
  if (row.source_url) {
    try { new URL(row.source_url); } catch {
      errors.push(`source_url "${row.source_url}" is not a valid URL`);
    }
  }

  return errors;
}

/**
 * Ingest a CSV file into the database.
 * Returns a summary: { inserted, skipped, errors }
 */
export async function ingestCsv(filePath) {
  const db = getDb();
  const fetchedAt = new Date().toISOString();

  const raw = readFileSync(filePath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const summary = { inserted: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-based + header row
    const errors = validateRow(row);

    if (errors.length) {
      summary.errors.push({ row: rowNum, errors });
      summary.skipped++;
      continue;
    }

    try {
      const classification = classifyRow(row);
      const venueId = await upsertVenue(db, row, classification);
      const confidenceScore = row.confidence_score ? parseFloat(row.confidence_score) : null;
      const inserted = await insertEvent(db, venueId, { ...row, confidence_score: confidenceScore }, fetchedAt, classification);

      if (inserted) summary.inserted++;
      else summary.skipped++;
    } catch (err) {
      summary.errors.push({ row: rowNum, errors: [err.message] });
      summary.skipped++;
    }
  }

  return summary;
}
