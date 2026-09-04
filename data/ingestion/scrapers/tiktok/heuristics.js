// Free, deterministic pre-processing for TikTok caption/comment extraction,
// run before any LLM call in parseEvent.js — mirrors the regex-helper style
// already established in scrapers/utils.js (extractDate, extractPrice,
// etc.) rather than inventing a new convention. See the LLM-evaluation plan
// for the reasoning: at Gemini Flash-Lite's per-call price, the dominant
// cost lever is how OFTEN the LLM is invoked at all, not which cheap model
// answers it — so as much as can be resolved for free/cheaply here, is.

// Phrases that mean a comment is naming a DIFFERENT, similar place for
// comparison/recommendation rather than confirming the video's own venue —
// this is the exact failure mode found live during testing: a top comment
// reading "Sake Bar Decibel in the East Village is a more affordable
// version in case anyone is wondering" named a real place, but not the one
// in the video (which was actually Yakuni). Matching any of these drops the
// comment from the candidate pool entirely, before it ever reaches the LLM
// as a possible source — a deterministic fix that doesn't depend on the LLM
// getting this judgment right every single time (the LLM's own system
// instruction keeps a semantic check for subtler phrasing as a backstop,
// not a replacement for this).
const COMPARISON_PATTERNS = [
  /\balternative to\b/i,
  /\breminds? me of\b/i,
  /\bsimilar to\b/i,
  /\binstead of\b/i,
  /\brather than\b/i,
  /\b(cheaper|more affordable|pricier|less expensive)\s+(version|option|alternative)\b/i,
  /\bcompared? to\b/i,
  /\b(vs\.?|versus)\b/i,
];

export function isComparisonComment(text) {
  if (!text) return false;
  return COMPARISON_PATTERNS.some(re => re.test(text));
}

function clean(s) {
  const trimmed = s?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

// High-precision, low-recall patterns for pulling a venue name or address
// directly from a caption's own explicit phrasing. Deliberately narrow —
// anything less clear-cut than these falls through to the LLM tier rather
// than risking a bad regex guess. Verified against real captions during
// evaluation: a location-pin emoji reliably precedes a street address
// ("📍146 S 2nd St"), not a venue name, so the two capture groups are kept
// separate rather than assumed to be the same thing. "Brooklyn Vintiques"
// (a real venue name that sits in flowing prose with no marker phrase
// nearby) correctly does NOT match either pattern here — proof this stays
// narrow enough to need the LLM for anything less explicit.
const PIN_EMOJI_RE = /📍\s*([^\n#]{2,80})/;
const CALLED_RE = /\bit'?s called\s+([^\n.!,;]{2,60})/i;
const LOCATED_RE = /\blocated (?:at|in)\s+([^\n.!,;]{2,60})/i;

/**
 * Attempts high-confidence extraction directly from a caption's own text,
 * with no LLM call. Returns { locationText, venueName } — either may be
 * null, and a caller shouldn't assume the two are populated together (a
 * pin emoji giving an address doesn't mean a name was found, and vice
 * versa).
 */
export function extractExplicitLocation(caption) {
  if (!caption) return { locationText: null, venueName: null };

  const pinMatch = caption.match(PIN_EMOJI_RE);
  const locatedMatch = caption.match(LOCATED_RE);
  const calledMatch = caption.match(CALLED_RE);

  return {
    locationText: clean(pinMatch?.[1]) ?? clean(locatedMatch?.[1]) ?? null,
    venueName: clean(calledMatch?.[1]) ?? null,
  };
}

// Keywords in TikTok's own topic-classification labels/hashtags/text that
// suggest the video is at least ABOUT some kind of place. Not exhaustive —
// that's fine, since hasAnyLocationSignal below is deliberately conservative:
// a miss here just means the LLM gets called when it maybe didn't need to
// (a fraction of a cent), while a false "no signal" would silently skip a
// video that had a real answer (a real accuracy loss) — a worse trade at
// these prices.
const PLACE_KEYWORDS = /\b(shop|store|boutique|restaurant|caf[eé]|bar|bakery|museum|gallery|market|trail|park|tour|studio|salon|spa|venue|club|bookstore|vintage)\b/i;

// A run of 2+ capitalized words ("Brooklyn Vintiques", "Zaidi's NYC") is a
// loose but useful signal that SOME proper-noun-shaped phrase exists
// somewhere in the text. Only used to decide whether it's worth spending an
// LLM call to go find a value — never to extract the value itself, which is
// far too noisy a signal for that (see extractExplicitLocation above).
const PROPER_NOUN_RUN_RE = /\b[A-Z][a-zA-Z']*(?:\s+[A-Z][a-zA-Z']*){1,4}\b/;

function looksPlaceLike(text) {
  return Boolean(text) && (PROPER_NOUN_RUN_RE.test(text) || PLACE_KEYWORDS.test(text));
}

/**
 * Conservative pre-check: is there ANY plausible location signal worth
 * asking an LLM about? Only returns false when there's really nothing to
 * go on — biased toward true (call the LLM) whenever in doubt, since a
 * skipped LLM call saves a fraction of a cent but a wrongly-skipped video
 * costs real accuracy.
 */
export function hasAnyLocationSignal({ caption, hashtags, comments, diversificationLabels, suggestedWords }) {
  if (looksPlaceLike(caption)) return true;

  const topicText = [...(hashtags ?? []), ...(diversificationLabels ?? []), ...(suggestedWords ?? [])].join(' ');
  if (PLACE_KEYWORDS.test(topicText)) return true;

  return (comments ?? [])
    .filter(c => !isComparisonComment(c.text))
    .some(c => looksPlaceLike(c.text));
}

/**
 * Heuristic ambiguity signal for escalating from the cheap LLM tier to the
 * stronger one: do multiple DIFFERENT, non-comparison comments each name a
 * distinct-looking place? A single comment repeating itself or several
 * comments agreeing on the same phrase isn't ambiguity — genuine
 * disagreement across independent commenters is a real signal the small
 * model's single read might have picked the wrong one.
 */
export function hasConflictingCommentCandidates(comments) {
  const candidates = new Set(
    (comments ?? [])
      .filter(c => !isComparisonComment(c.text))
      .map(c => c.text?.match(PROPER_NOUN_RUN_RE)?.[0]?.toLowerCase())
      .filter(Boolean)
  );
  return candidates.size >= 2;
}
