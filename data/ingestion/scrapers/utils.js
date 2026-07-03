const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Extract an ISO date string (YYYY-MM-DD) from free-form text.
 * Returns null if nothing parseable is found.
 */
export function extractDate(text) {
  if (!text) return null;
  const now = new Date();

  if (/\btonight\b/i.test(text)) return toISO(now);
  if (/\btomorrow\b/i.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 1); return toISO(d); }

  // "this Saturday" / "next Friday"
  const relDay = text.match(/\b(?:this|next)?\s*(Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/i);
  if (relDay) {
    const target = DAYS.findIndex(d => relDay[1].toLowerCase().startsWith(d.slice(0, 3)));
    if (target !== -1) {
      let diff = target - now.getDay();
      if (diff <= 0) diff += 7;
      const d = new Date(now); d.setDate(d.getDate() + diff);
      return toISO(d);
    }
  }

  // "July 4", "July 4th", "July 4, 2026", "Jul 4"
  const monthDay = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i);
  if (monthDay) {
    const month = MONTHS[monthDay[1].slice(0, 3).toLowerCase()];
    const day   = parseInt(monthDay[2]);
    const year  = monthDay[3] ? parseInt(monthDay[3]) : now.getFullYear();
    let d = new Date(year, month, day);
    if (!monthDay[3] && d < now) d = new Date(year + 1, month, day);
    if (!isNaN(d)) return toISO(d);
  }

  // "7/4" or "7/4/26"
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    const m    = parseInt(numeric[1]) - 1;
    const day  = parseInt(numeric[2]);
    const yr   = numeric[3] ? (numeric[3].length === 2 ? 2000 + parseInt(numeric[3]) : parseInt(numeric[3])) : now.getFullYear();
    const d    = new Date(yr, m, day);
    if (!isNaN(d) && d >= now) return toISO(d);
  }

  return null;
}

/**
 * Given a day-of-week name ("Saturday"), return the ISO date of the next occurrence.
 */
export function nextWeekday(dayName) {
  const target = DAYS.findIndex(d => d.startsWith(dayName.toLowerCase().slice(0, 3)));
  if (target === -1) return null;
  const now = new Date();
  let diff = target - now.getDay();
  if (diff <= 0) diff += 7;
  const d = new Date(now); d.setDate(d.getDate() + diff);
  return toISO(d);
}

/**
 * Extract "HH:MM:SS" from text like "8pm", "8:30 PM", "10:30 a.m."
 */
export function extractTime(text) {
  if (!text) return null;
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2] ?? '00';
  const period = m[3].toLowerCase();
  if (period === 'p' && h !== 12) h += 12;
  if (period === 'a' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min.padStart(2, '0')}:00`;
}

/**
 * Return a price object from free-text.
 */
export function extractPrice(text) {
  if (!text) return { price_text: null, is_free: 'false' };
  // Negative lookbehind excludes "feel free to ..." — a common idiom in
  // longer free-text descriptions (RSVP invites, etc.) that isn't a price
  // signal at all, unlike "free entry"/"free with RSVP"/"FREE SHOW".
  if (/(?<!feel )\bfree\b/i.test(text)) return { price_text: 'Free', is_free: 'true' };
  const m = text.match(/\$(\d+(?:\.\d{2})?)/);
  return m ? { price_text: `$${m[1]}`, is_free: 'false' } : { price_text: null, is_free: 'false' };
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Lowercase + strip punctuation/extra whitespace, for dedup matching
 * (normalized_title, normalized_venue_name).
 */
export function normalizeText(str) {
  if (!str) return null;
  const out = str.toLowerCase()
    .replace(/['’‘"“”]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out || null;
}

/**
 * Normalize a scraper's `tags` field (array, comma-separated string, or
 * missing) into a clean array of trimmed, non-empty strings.
 */
export function normalizeTags(tags) {
  const raw = tags
    ? (Array.isArray(tags) ? tags : String(tags).split(','))
    : [];
  return raw.map(t => String(t).trim()).filter(Boolean);
}

/**
 * Concatenate searchable fields into one lowercased blob for simple LIKE search.
 */
export function buildSearchText(...parts) {
  const joined = parts
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return joined || null;
}

/**
 * Best-effort parse of "21+", "18+", "must be 21" etc. from free text.
 * Returns a normalized string like "21+", or null if no restriction is mentioned.
 */
export function extractAgeRestriction(text) {
  if (!text) return null;
  const plus = text.match(/\b(\d{2})\s*\+/);
  if (plus) return `${plus[1]}+`;
  const must = text.match(/must be\s+(\d{2})\s*(?:years?|or older)/i);
  if (must) return `${must[1]}+`;
  if (/\ball ages\b/i.test(text)) return 'All ages';
  return null;
}

/**
 * Best-effort split of a US-style free-text address into parts. Handles the
 * common comma-separated form ("123 Main St, Brooklyn, NY 11201"), semicolon
 * delimiters, trailing "USA"/"United States" markers, and city+state+zip
 * combined into one segment without a comma ("Brooklyn NY 11237").
 * Returns nulls for any part it can't confidently extract — never guesses.
 */
export function splitUSAddress(addressStr) {
  const empty = { line: null, city: null, region: null, postal: null, country: null };
  if (!addressStr) return empty;

  // Normalize delimiters and strip a trailing country marker
  let cleaned = addressStr.replace(/;/g, ',');
  cleaned = cleaned.replace(/,?\s*(USA|US|United States)\.?\s*$/i, '').trim();

  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return empty;

  const last = parts[parts.length - 1];

  // Form 1: last segment is exactly "ST" or "ST ZIP"
  const stateZip = last.match(/^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
  if (stateZip) {
    // With only 2 segments, the first is the city ONLY if it doesn't start
    // with a number — "56-06 Cooper Ave. Ridgewood, NY" has street+city
    // merged with no delimiter, and we can't safely split that further.
    const soleSegmentIsCity = parts.length === 2 && !/^\d/.test(parts[0]);
    return {
      line:   parts.length >= 3 ? parts[0] : null,
      // "123 Main St, Brooklyn, NY" → city is the part just before state/zip.
      city:   parts.length >= 3 ? parts[parts.length - 2] : (soleSegmentIsCity ? parts[0] : null),
      region: stateZip[1].toUpperCase(),
      postal: stateZip[2] ?? null,
      country: 'US',
    };
  }

  // Form 2: city+state+zip combined in one segment, e.g. "Brooklyn NY 11237"
  const combined = last.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (combined) {
    return {
      line:   parts.length >= 2 ? parts.slice(0, -1).join(', ') : null,
      city:   combined[1].trim(),
      region: combined[2].toUpperCase(),
      postal: combined[3],
      country: 'US',
    };
  }

  return empty;
}

/**
 * Build an RFC 5545 RRULE string from a list of weekday names.
 * e.g. ["Wednesday", "Friday"] → "FREQ=WEEKLY;BYDAY=WE,FR"
 */
export function buildWeeklyRRule(dayNames) {
  if (!dayNames?.length) return null;
  const map = { sun: 'SU', mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA' };
  const codes = dayNames
    .map(d => map[d.toLowerCase().slice(0, 3)])
    .filter(Boolean);
  if (!codes.length) return null;
  return `FREQ=WEEKLY;BYDAY=${codes.join(',')}`;
}

// Kept in sync with the DELETE ... ILIKE ANY(...) list in
// offmap/supabase/reviews/bulk_actions.sql — update both together.
export const EXCLUDED_AUDIENCE_PATTERNS = [
  // Kids
  'kids', 'for kids', 'for children', 'kid-friendly', 'kidfriendly', "children's",
  'childrens', 'toddler', 'storytime', 'story time', 'youth', 'junior',
  'after school', 'afterschool', 'school break', 'camp', 'little ones',
  'baby', 'babies', 'ages 5', 'ages 3', 'under 12',
  // Seniors
  'seniors', 'senior center', 'elderly', '55+', '60+', '65+', '70+',
  'aging', 'older adults', 'caregiver', 'dementia', 'memory care',
  'retirement', 'aarp',
  // Family-only
  'family friendly', 'family-friendly', 'all ages', 'all-ages',
  'bring the kids', 'bring your kids', 'families welcome',
  'kids welcome', 'children welcome',
];

/**
 * True when an event's title/description matches a kids-only, senior-only,
 * or general "family friendly"/"all ages" audience pattern. Events that
 * match are dropped before insertion — see runner.js.
 */
export function isExcludedAudience(title, description) {
  const text = `${title ?? ''} ${description ?? ''}`.toLowerCase();
  return EXCLUDED_AUDIENCE_PATTERNS.some(pattern => text.includes(pattern));
}
