// Fallback path when no `poi` tag is present: heuristics first (see
// heuristics.js), then Gemini only for whatever heuristics couldn't
// resolve — mirroring scrapers/genericurl/pipeline.js's small-then-large
// LLM escalation ladder (extract/llmSmall.js -> extract/llmLarge.js) rather
// than inventing a new philosophy. Standardized on Gemini (not Groq, this
// module's original choice) because GEMINI_API_KEY is already live in this
// environment and this exact escalation pattern is already proven here —
// see the LLM-evaluation plan for the full comparison.

import { GoogleGenAI, Type } from '@google/genai';
import { isComparisonComment, extractExplicitLocation, hasAnyLocationSignal, hasConflictingCommentCandidates } from './heuristics.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// TikTok's creator-tagged `poi.category` / `poi.ttTypeNameSuper` values,
// mapped onto OFFMAP's own controlled vocab (classify.js's CATEGORIES).
// Seeded with only the value confirmed during planning ("Shopping" — from
// a real tagged vintage shop) — extend this as more are observed rather
// than guessing at TikTok's full POI taxonomy. An unmapped poi category
// falls back to classify()'s normal keyword scan over the caption/name text,
// so nothing breaks for a category not yet in this table — it just doesn't
// get the accuracy boost.
const POI_CATEGORY_MAP = {
  Shopping: 'Shopping',
};

// Every extracted field carries a `source` explaining exactly where the
// value came from, so the UI can flag anything that isn't first-party.
const SOURCE = {
  POI_TAG: 'creator_poi_tag',
  CAPTION: 'caption',
  CREATOR_REPLY: 'creator_reply',
  COMMENT: 'comment',
};

const EMPTY_FIELD = { value: null, source: 'none', source_quote: null, confidence: 0 };

/**
 * `poi` present means the creator explicitly tagged a location when
 * posting — TikTok's own structured data, not a guess from text. This is
 * ground truth and skips heuristics/LLM entirely for name/address/category.
 */
function extractFromPoiTag(poi) {
  const mappedCategory = POI_CATEGORY_MAP[poi.category] ?? POI_CATEGORY_MAP[poi.ttTypeNameSuper] ?? null;

  return {
    venue_name: { value: poi.name ?? null, source: SOURCE.POI_TAG, source_quote: null, confidence: 0.95 },
    location_text: { value: poi.address ?? poi.city ?? null, source: SOURCE.POI_TAG, source_quote: null, confidence: 0.95 },
    category: mappedCategory,
    sub_category_hint: poi.ttTypeNameMedium ?? poi.ttTypeNameTiny ?? null,
  };
}

const FIELD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    value:        { type: Type.STRING, nullable: true },
    source:       { type: Type.STRING, enum: [SOURCE.CAPTION, SOURCE.CREATOR_REPLY, SOURCE.COMMENT, 'none'] },
    source_quote: { type: Type.STRING, nullable: true, description: 'The exact caption/comment text the value was pulled from, verbatim. Null if source is "none".' },
    confidence:   { type: Type.NUMBER, description: '0-1' },
  },
  required: ['value', 'source', 'source_quote', 'confidence'],
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    venue_name:    FIELD_SCHEMA,
    location_text: FIELD_SCHEMA,
    category_hint: { type: Type.STRING, nullable: true, description: 'A short freeform category guess (e.g. "vintage store", "cocktail bar", "hiking trail") if the content makes one apparent, else null.' },
  },
  required: ['venue_name', 'location_text', 'category_hint'],
};

const SYSTEM_INSTRUCTION = `You extract the name and location of the specific place or event featured in a TikTok video, from its caption, hashtags, topic labels, and comments.

You will be told which comments (if any) are replies from the video's OWN creator — those are trustworthy first-party confirmations, e.g. a creator replying "it's called ___" to a "where is this?" question. Comments that are obvious comparisons to a different place have already been filtered out before reaching you, but stay alert for subtler phrasing that does the same thing: a comment naming a DIFFERENT place for comparison or recommendation, not confirming the video's own venue. Never treat a comparison as if it confirms the video's own venue.

If you use a value from any comment (creator or not), set source_quote to the exact comment text so a human reviewer can check it.

If nothing identifies a specific place or location with reasonable confidence, set that field's value to null, source to "none", and confidence to 0.

Return confidence 0.7+ only when the caption itself states the value directly, or a creator reply confirms it. A value that comes only from a random (non-creator) comment must never exceed confidence 0.4, regardless of how you rate your own certainty — comment-only leads need human verification.`;

function buildPrompt({ caption, hashtags, diversificationLabels, suggestedWords, creatorReplies, otherComments, seed }) {
  const parts = [];
  if (caption) parts.push(`Caption:\n${caption}`);
  if (hashtags?.length) parts.push(`Hashtags: ${hashtags.map(h => `#${h}`).join(' ')}`);
  if (diversificationLabels?.length || suggestedWords?.length) {
    parts.push(`TikTok's own topic labels for this video: ${[...(diversificationLabels ?? []), ...(suggestedWords ?? [])].join(', ')}`);
  }
  if (creatorReplies.length) {
    parts.push(`Replies from the video's OWN creator (trustworthy):\n${creatorReplies.map(c => `- "${c.text}"`).join('\n')}`);
  }
  if (otherComments.length) {
    parts.push(`Comments from other viewers (NOT the creator):\n${otherComments.map(c => `- "${c.text}"`).join('\n')}`);
  }
  if (seed?.locationText) {
    parts.push(`A location pin already found in the caption (verify/refine, don't discard unless clearly wrong): ${seed.locationText}`);
  }
  if (seed?.venueName) {
    parts.push(`A venue name already found in the caption (verify/refine, don't discard unless clearly wrong): ${seed.venueName}`);
  }
  return parts.join('\n\n');
}

// A rate limit, billing lapse, or transient network error here shouldn't
// crash the whole import — same reasoning as fetchComments.js treating a
// blocked/broken endpoint as "no comments" rather than a hard failure. A
// null return here just means the caller falls back to whatever heuristics
// already found (possibly nothing), leaving the user to fill the form in
// manually — degraded, not broken.
async function callGemini(model, prompt, maxOutputTokens) {
  let response;
  try {
    response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens,
      },
      contents: prompt,
    });
  } catch (err) {
    console.warn(`[tiktok] Gemini call (${model}) failed: ${err.message}`);
    return null;
  }

  const raw = response.text?.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function capCommentConfidence(parsed) {
  for (const field of ['venue_name', 'location_text']) {
    if (parsed[field]?.source === SOURCE.COMMENT && parsed[field].confidence > 0.4) {
      parsed[field].confidence = 0.4;
    }
  }
  return parsed;
}

const CONFIDENCE_ESCALATION_BAR = 0.6;

function needsEscalation(parsed, hadInputWorthReasoningAbout, conflictingCandidates) {
  if (conflictingCandidates) return true;
  if (!hadInputWorthReasoningAbout) return false;
  const bestConfidence = Math.max(parsed.venue_name?.confidence ?? 0, parsed.location_text?.confidence ?? 0);
  return bestConfidence < CONFIDENCE_ESCALATION_BAR;
}

/**
 * Fallback path when no `poi` tag is present. Order: heuristic regex
 * extraction from the caption (free) -> heuristic "any signal at all"
 * pre-check (free, conservative) -> Gemini Flash-Lite (cheap) -> Gemini
 * Flash, only escalated to on low confidence or heuristically-detected
 * disagreement between comments (still cheap, but reserved for the minority
 * of genuinely ambiguous cases).
 */
async function extractFromText({ caption, hashtags, diversificationLabels, suggestedWords, comments }) {
  const seed = extractExplicitLocation(caption);

  // Both halves resolved by regex alone (an explicit "it's called X" name
  // AND a location pin) — skip the LLM entirely, nothing left to reason
  // about. This is the rare case; usually at most one half hits (see the
  // "Brooklyn Vintiques" case in the LLM-evaluation plan: the pin gives an
  // address but the name sits in prose no regex should guess at).
  if (seed.venueName && seed.locationText) {
    const field = (value) => ({ value, source: SOURCE.CAPTION, source_quote: caption, confidence: 0.9 });
    return { venue_name: field(seed.venueName), location_text: field(seed.locationText), category: null, sub_category_hint: null };
  }

  const creatorReplies = (comments ?? []).filter(c => c.isCreatorReply);
  const otherComments = (comments ?? [])
    .filter(c => !c.isCreatorReply && !isComparisonComment(c.text))
    .slice(0, 15);

  // Falls back to whatever regex already found (rather than a blank slate)
  // whenever the LLM has nothing to add — no signal worth asking about, or
  // the call itself failed/errored (rate limit, billing lapse, network).
  // A heuristic half-answer already in hand shouldn't be thrown away just
  // because the LLM couldn't be reached for the other half.
  const seedOrEmpty = () => ({
    venue_name: seed.venueName ? { value: seed.venueName, source: SOURCE.CAPTION, source_quote: caption, confidence: 0.9 } : EMPTY_FIELD,
    location_text: seed.locationText ? { value: seed.locationText, source: SOURCE.CAPTION, source_quote: caption, confidence: 0.9 } : EMPTY_FIELD,
    category: null,
    sub_category_hint: null,
  });

  const hadInputWorthReasoningAbout = hasAnyLocationSignal({ caption, hashtags, comments, diversificationLabels, suggestedWords });
  if (!hadInputWorthReasoningAbout && !creatorReplies.length) {
    // Nothing else worth an LLM call — a human filling the form manually
    // for whatever regex didn't already find is the same outcome an LLM
    // call would have reached anyway.
    return seedOrEmpty();
  }

  const prompt = buildPrompt({ caption, hashtags, diversificationLabels, suggestedWords, creatorReplies, otherComments, seed });

  let parsed = await callGemini('gemini-flash-lite-latest', prompt, 1024);
  if (!parsed) return seedOrEmpty();
  parsed = capCommentConfidence(parsed);

  const conflicting = hasConflictingCommentCandidates(otherComments);
  if (needsEscalation(parsed, hadInputWorthReasoningAbout, conflicting)) {
    const escalated = await callGemini('gemini-flash-latest', prompt, 1024);
    if (escalated) parsed = capCommentConfidence(escalated);
  }

  // Prefer a regex-found half over whatever the LLM guessed for that same
  // field, when the LLM's own confidence for it isn't clearly better —
  // the regex hit is a verbatim match, not a guess.
  if (seed.locationText && (parsed.location_text?.source !== SOURCE.CAPTION || (parsed.location_text?.confidence ?? 0) < 0.9)) {
    parsed.location_text = { value: seed.locationText, source: SOURCE.CAPTION, source_quote: caption, confidence: 0.9 };
  }
  if (seed.venueName && (parsed.venue_name?.source !== SOURCE.CAPTION || (parsed.venue_name?.confidence ?? 0) < 0.9)) {
    parsed.venue_name = { value: seed.venueName, source: SOURCE.CAPTION, source_quote: caption, confidence: 0.9 };
  }

  return {
    venue_name: parsed.venue_name ?? EMPTY_FIELD,
    location_text: parsed.location_text ?? EMPTY_FIELD,
    category: null, // no reliable structured category signal in this path — classify.js's keyword scan handles it
    sub_category_hint: parsed.category_hint ?? null,
  };
}

/**
 * Extracts venue_name/location_text/category for a TikTok video.
 * Priority: creator-tagged `poi` (ground truth, skips everything else) >
 * heuristic regex extraction from the caption > Gemini extraction from
 * caption/hashtags/comments (guardrailed against comment-only false leads).
 */
export async function extractEvent({ caption, hashtags, diversificationLabels, suggestedWords, poi, comments }) {
  if (poi?.name) {
    return extractFromPoiTag(poi);
  }

  return extractFromText({ caption, hashtags, diversificationLabels, suggestedWords, comments });
}
