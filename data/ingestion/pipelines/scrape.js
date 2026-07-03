import 'dotenv/config';
import { runScrapers } from './runner.js';

const args        = process.argv.slice(2);
const skipGeocode = args.includes('--skip-geocode');
const only        = args.filter(a => !a.startsWith('--'));
const totals      = await runScrapers({ ...(only.length ? { only } : {}), skipGeocode });

console.log(`\nDone — inserted: ${totals.inserted}, skipped: ${totals.skipped}, errors: ${totals.errors}`);
