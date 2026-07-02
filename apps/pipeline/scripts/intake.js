import 'dotenv/config';
import { ingestCsv } from '../src/intake/csv-intake.js';

const [, , csvPath] = process.argv;

if (!csvPath) {
  console.error('Usage: node scripts/intake.js <path-to-csv>');
  process.exit(1);
}

const summary = await ingestCsv(csvPath);
console.log(`Intake complete: ${summary.inserted} inserted, ${summary.skipped} skipped`);

if (summary.errors.length) {
  console.warn('Validation errors:');
  for (const { row, errors } of summary.errors) {
    console.warn(`  Row ${row}: ${errors.join('; ')}`);
  }
}
