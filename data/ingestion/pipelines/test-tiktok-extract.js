// Throwaway verification CLI for `node pipelines/test-tiktok-extract.js <url>`.
//
// Runs the extraction half of the TikTok import pipeline (no DB writes) and
// prints what it found. Written specifically to check the two videos used
// during planning:
//   - https://www.tiktok.com/t/ZTUdtvcAW/  — no poi tag, must fall back to
//     caption/comment extraction and must NOT surface "Sake Bar Decibel"
//     (a comparison mentioned in a top comment, not the video's own venue).
//   - https://www.tiktok.com/t/ZTUdvH7DV/  — has a poi tag ("Zaidi's NYC"),
//     must return it via source: 'creator_poi_tag' without needing the LLM.

import 'dotenv/config';
import { extractTikTokImport } from '../scrapers/tiktok/index.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node pipelines/test-tiktok-extract.js <tiktok-url>');
  process.exit(1);
}

console.log(`Extracting ${url}…\n`);
const result = await extractTikTokImport(url);

console.log(JSON.stringify(result, null, 2));

console.log('\n--- summary ---');
console.log(`canonical: ${result.canonicalUrl}`);
console.log(`venue_name: ${result.venueName} (source: ${result.extractedFields.venue_name.source}, confidence: ${result.extractedFields.venue_name.confidence})`);
console.log(`address: ${result.address} (source: ${result.extractedFields.location_text.source}, confidence: ${result.extractedFields.location_text.confidence})`);
console.log(`categories: ${result.categories.join(', ') || '(none)'}`);
console.log(`geocoded: ${result.lat != null ? `${result.lat}, ${result.lng} (confidence ${result.geocodeConfidence})` : 'no'}`);

if (result.venueName && /sake bar decibel/i.test(result.venueName)) {
  console.error('\n⚠ REGRESSION: extraction surfaced "Sake Bar Decibel" as the venue — this is the known comparison-comment false lead. The guardrail is not working.');
  process.exit(1);
}
