// Centralized two-level category classification for events and venues.
//
// `categories` is a controlled vocabulary — schema-enforced via a CHECK
// constraint (offmap/supabase/migrations/20260626000000_add_categories.sql).
// CATEGORIES below must stay in sync with that constraint.
//
// `sub_categories` is intentionally freeform: add a rule to RULES/HARD_RULES
// and a new sub-category value appears in the data with no schema change.
//
// This is called from db/funnel.js (insertEvent/upsertVenue) — the same
// central place normalized_title/search_text are computed — so no scraper
// needs its own category mapping.

export const CATEGORIES = [
  'Music',
  'Nightlife',
  'Visual Arts & Museums',
  'Arts & Crafts',
  'Arts & Performance',
  'Outdoors & Nature',
  'Food & Drink',
  'Community & Culture',
  'Talks & Education',
  'Wellness',
  'Fashion',
  'Shopping',
];

// Secondary signal: matched against the raw scraper-supplied `category`
// string (already a per-source label, e.g. nycparks' own "Cultural"/"Market"
// buckets — see scrapers/nycparks.js) by exact match. The keyword RULES below
// are the primary signal and read title/description/tags/venue_name instead.
const CATEGORY_ALIASES = {
  art: 'Visual Arts & Museums',
  museum: 'Visual Arts & Museums',
  gallery: 'Visual Arts & Museums',
  music: 'Music',
  nature: 'Outdoors & Nature',
  wellness: 'Wellness',
  education: 'Talks & Education',
  market: 'Shopping',
  cultural: 'Community & Culture',
  festival: 'Community & Culture',
  film: 'Arts & Performance',
  community: 'Community & Culture',
};

// Phrases that always resolve to a fixed multi-category + sub-category pair,
// regardless of any other signal in the text.
const HARD_RULES = [
  { test: /farmers market/, categories: ['Food & Drink', 'Shopping'], subCategories: ['Farmers Market'] },
  { test: /sample sale/,    categories: ['Fashion', 'Shopping'],      subCategories: ['Sample Sale'] },
];

// Keyword -> category/sub-category rules. Order doesn't matter — every
// matching rule contributes (categories and sub-categories both dedup via
// Set), so a single event can land in several buckets at once (e.g. a
// "vintage clothing pop-up" hits both Fashion and Shopping).
const RULES = [
  // Music
  { test: /\b(concert|gig|live music|open mic|karaoke night|dj set|album release|listening party|jam session)\b/, categories: ['Music'], subCategories: ['Live Music'] },
  { test: /\bmusic festival\b/, categories: ['Music'], subCategories: ['Festival'] },

  // Nightlife
  { test: /\b(nightclub|club night|rave|afterparty|after-party|warehouse party|bottle service)\b/, categories: ['Nightlife'], subCategories: ['Club Night'] },
  { test: /\b(bar crawl|pub crawl)\b/, categories: ['Nightlife'], subCategories: ['Bar Crawl'] },

  // Visual Arts & Museums
  { test: /\b(museum|gallery|art exhibit|exhibition|art installation)\b/, categories: ['Visual Arts & Museums'], subCategories: ['Exhibit'] },

  // Arts & Crafts
  { test: /\b(craft fair|craft market)\b/, categories: ['Arts & Crafts'], subCategories: ['Craft Fair'] },
  { test: /\b(pottery|ceramics)\b/, categories: ['Arts & Crafts'], subCategories: ['Pottery'] },
  { test: /\b(knitting|crochet)\b/, categories: ['Arts & Crafts'], subCategories: ['Fiber Arts'] },
  { test: /\b(paint and sip|paint & sip|painting class)\b/, categories: ['Arts & Crafts'], subCategories: ['Paint & Sip'] },
  { test: /\bjewelry making\b/, categories: ['Arts & Crafts'], subCategories: ['Jewelry Making'] },

  // Arts & Performance
  { test: /\b(theater|theatre|play|musical)\b/, categories: ['Arts & Performance'], subCategories: ['Theater'] },
  { test: /\b(comedy show|stand-?up)\b/, categories: ['Arts & Performance'], subCategories: ['Comedy'] },
  { test: /\b(drag show|drag brunch|drag bingo)\b/, categories: ['Arts & Performance'], subCategories: ['Drag'] },
  { test: /\b(ballet|opera|dance performance)\b/, categories: ['Arts & Performance'], subCategories: ['Dance'] },
  { test: /\b(burlesque|cabaret)\b/, categories: ['Arts & Performance'], subCategories: ['Burlesque'] },
  { test: /\b(poetry slam|spoken word)\b/, categories: ['Arts & Performance'], subCategories: ['Spoken Word'] },
  { test: /\b(film screening|movie night|short film)\b/, categories: ['Arts & Performance'], subCategories: ['Film'] },

  // Outdoors & Nature
  { test: /\b(hike|hiking|nature walk|trail walk)\b/, categories: ['Outdoors & Nature'], subCategories: ['Hiking'] },
  { test: /\b(birdwatching|bird watching)\b/, categories: ['Outdoors & Nature'], subCategories: ['Birdwatching'] },
  { test: /\b(garden tour|botanic)\b/, categories: ['Outdoors & Nature'], subCategories: ['Garden Tour'] },
  { test: /\b(stargazing|astronomy night)\b/, categories: ['Outdoors & Nature'], subCategories: ['Stargazing'] },
  { test: /\b(kayak|canoe|paddle)\b/, categories: ['Outdoors & Nature'], subCategories: ['Paddling'] },
  { test: /\bpark cleanup\b/, categories: ['Outdoors & Nature'], subCategories: ['Park Cleanup'] },

  // Food & Drink
  { test: /\b(wine tasting|beer tasting|whisky tasting|whiskey tasting|tasting menu)\b/, categories: ['Food & Drink'], subCategories: ['Tasting'] },
  { test: /\bhappy hour\b/, categories: ['Food & Drink'], subCategories: ['Happy Hour'] },
  { test: /\b(supper club|dinner party|pop-?up restaurant|pop-?up dinner)\b/, categories: ['Food & Drink'], subCategories: ['Supper Club'] },
  { test: /\b(food festival|food crawl|restaurant week)\b/, categories: ['Food & Drink'], subCategories: ['Food Festival'] },
  { test: /\bbrunch\b/, categories: ['Food & Drink'], subCategories: ['Brunch'] },
  { test: /\bfood\b/, categories: ['Food & Drink'], subCategories: ['Food'] },

  // Community & Culture
  { test: /\b(volunteer|volunteering)\b/, categories: ['Community & Culture'], subCategories: ['Volunteering'] },
  { test: /\b(cultural festival|heritage festival|heritage month)\b/, categories: ['Community & Culture'], subCategories: ['Cultural Festival'] },
  { test: /\b(parade|block party)\b/, categories: ['Community & Culture'], subCategories: ['Parade'] },
  { test: /\b(town hall|community meeting|civic)\b/, categories: ['Community & Culture'], subCategories: ['Civic'] },

  // Talks & Education
  { test: /\b(lecture|panel discussion|panel talk)\b/, categories: ['Talks & Education'], subCategories: ['Lecture'] },
  { test: /\b(workshop|seminar)\b/, categories: ['Talks & Education'], subCategories: ['Workshop'] },
  { test: /\b(book club|author talk|book signing)\b/, categories: ['Talks & Education'], subCategories: ['Book Club'] },
  { test: /\b(walking tour|guided tour|history tour)\b/, categories: ['Talks & Education'], subCategories: ['Tour'] },

  // Wellness — Active
  { test: /\b(run club|running club|5k|10k|fun run|yoga|pilates|fitness class|bootcamp|hiit|spin class|workout)\b/, categories: ['Wellness'], subCategories: ['Active'] },

  // Wellness — Mindfulness
  { test: /\b(meditation|mindfulness|sound bath|breathwork)\b/, categories: ['Wellness'], subCategories: ['Mindfulness'] },

  // Fashion
  { test: /\b(fashion show|runway show|fashion week)\b/, categories: ['Fashion'], subCategories: ['Fashion Show'] },
  { test: /\bdesigner pop-?up\b/, categories: ['Fashion'], subCategories: ['Designer Pop-Up'] },

  // Shopping
  { test: /\b(pop-?up shop|vendor market|flea market|bazaar|maker'?s market|night market|holiday market)\b/, categories: ['Shopping'], subCategories: ['Market'] },
];

function buildClassificationText({ title, description, category, tags, venue_name } = {}) {
  return [title, description, category, ...(tags ?? []), venue_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Classify free-text event/venue fields into the controlled top-level
 * `categories` and freeform `sub_categories`. Pure function of its inputs.
 */
export function classify(fields) {
  const text = buildClassificationText(fields);
  const categories = new Set();
  const subCategories = new Set();

  for (const rule of [...HARD_RULES, ...RULES]) {
    if (rule.test.test(text)) {
      rule.categories.forEach(c => categories.add(c));
      rule.subCategories.forEach(s => subCategories.add(s));
    }
  }

  const alias = CATEGORY_ALIASES[String(fields?.category ?? '').toLowerCase().trim()];
  if (alias) categories.add(alias);

  return { categories: [...categories], subCategories: [...subCategories] };
}
