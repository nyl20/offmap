import 'dotenv/config';
import { backfillCategories } from '../db/backfill-categories.js';

const summary = await backfillCategories();
console.log(`Backfill complete: ${summary.eventsUpdated} events, ${summary.venuesUpdated} venues updated`);
