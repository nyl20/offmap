// Platform adapter registry. Order matters: exact-domain adapters are
// checked before the generic Webflow fingerprint, since a great many
// unrelated sites are Webflow-built and would otherwise shadow a more
// specific match (not relevant among these four today, but keeps the
// invariant explicit as more adapters are added).
import * as luma from './luma.js';
import * as eventbrite from './eventbrite.js';
import * as partiful from './partiful.js';
import * as elfsight from './elfsight.js';
import * as webflow from './webflow.js';

// Webflow's generic CMS fingerprint stays last — a Webflow site embedding
// an Elfsight events widget (bibliothequenyc.com, in fact) should match
// Elfsight's more specific, higher-confidence adapter first.
export const ADAPTERS = [luma, eventbrite, partiful, elfsight, webflow];

export function findAdapter(url, html) {
  return ADAPTERS.find(a => a.matches(url, html)) ?? null;
}
