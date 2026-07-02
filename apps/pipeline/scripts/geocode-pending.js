import 'dotenv/config';
import { geocodePendingVenues } from '../src/geocoding/mapbox.js';

const summary = await geocodePendingVenues();
console.log(`Geocoding complete: ${summary.resolved} resolved, ${summary.failed} failed`);
