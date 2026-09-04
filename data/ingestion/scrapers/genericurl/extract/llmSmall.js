// Tier 2 extraction: a small, cheap Gemini call on a trimmed text snippet —
// only reached when tier 1 (deterministic JSON-LD/microdata/platform
// adapter) found nothing usable. Text-only input (no image/video tokens,
// unlike per-image/per-frame Vision OCR calls), and
// the "-latest" lite alias specifically because it's the cheapest model in
// the family already used in this codebase — most sites should never reach
// tier 3, so this is where per-call cost matters most in aggregate.
//
// Uses the `-latest` alias (gemini-flash-lite-latest) rather than a pinned
// version, matching how scrapers/instagram/parseEvent.js already pins to
// `gemini-flash-latest` rather than a dated model id — verified live during
// implementation that a pinned id (gemini-2.5-flash-lite) had already been
// retired ("no longer available to new users"), which a `-latest` alias is
// built to avoid.

import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You extract event listings from webpage text for an events-map app.

Given text scraped from a venue or organization's website, extract structured details for every
distinct upcoming or recent event described. The text may describe zero events (e.g. a page with
no current listings), one event, or several. Extract each one separately.

Only extract events that have a clear specific date. Do not invent or guess a date for an event
that doesn't state one. Return an empty array if the text does not describe any specific events.`;

export const EVENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title:         { type: Type.STRING },
    description:   { type: Type.STRING, nullable: true },
    start_time:    { type: Type.STRING, description: 'ISO 8601 date or datetime, e.g. 2026-09-12 or 2026-09-12T20:00:00' },
    end_time:      { type: Type.STRING, nullable: true },
    venue_name:    { type: Type.STRING, nullable: true },
    venue_address: { type: Type.STRING, nullable: true },
    price_text:    { type: Type.STRING, nullable: true, description: 'e.g. "$20", "Free", "$15-$25"' },
    is_free:       { type: Type.BOOLEAN, nullable: true },
    ticket_url:    { type: Type.STRING, nullable: true },
  },
  required: ['title', 'start_time'],
};

export const RESPONSE_SCHEMA = { type: Type.ARRAY, items: EVENT_SCHEMA };

function toRows(parsed, sourceUrl) {
  if (!Array.isArray(parsed)) return [];
  return parsed.map(e => ({
    title:         e.title,
    description:   e.description ?? null,
    start_time:    e.start_time,
    end_time:      e.end_time ?? null,
    venue_name:    e.venue_name ?? null,
    venue_address: e.venue_address ?? null,
    price_text:    e.price_text ?? null,
    is_free:       e.is_free === true ? 'true' : e.is_free === false ? 'false' : null,
    ticket_url:    e.ticket_url ?? null,
    source_url:    sourceUrl,
  }));
}

export async function extractWithSmallLLM(trimmedText, url) {
  if (!trimmedText?.trim()) return [];

  const response = await ai.models.generateContent({
    model: 'gemini-flash-lite-latest',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 2048,
    },
    contents: `Page URL: ${url}\n\nPage text:\n${trimmedText}`,
  });

  const raw = response.text?.trim();
  if (!raw) return [];

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }

  return toRows(parsed, url);
}
