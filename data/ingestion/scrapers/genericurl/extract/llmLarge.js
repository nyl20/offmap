// Tier 3 extraction: last resort for messy one-off sites where tier 2's
// smaller snippet/model came back empty or low-confidence but the page
// still visibly contains date-like text (see validate.js's cross-check).
//
// Deliberately stays on the same vendor/model FAMILY as tier 2 rather than
// introducing a second LLM provider — the only difference is stepping up
// from gemini-flash-lite-latest to gemini-flash-latest and giving it a much
// larger slice of the page. No new API key, no new cost line. If real usage
// ever shows this tier is a genuine accuracy bottleneck (not just an empty-
// result bottleneck), swapping the model id here is a one-line change —
// there's no reason to pre-pay for a bigger model before that's known.

import { GoogleGenAI } from '@google/genai';
import { RESPONSE_SCHEMA } from './llmSmall.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You extract event listings from webpage text for an events-map app.

Given text scraped from a venue or organization's website, extract structured details for every
distinct upcoming or recent event described. The text may describe zero events, one event, or
several — extract each one separately. This text may be messier or less structured than a typical
page (e.g. a blog post, a newsletter archive, a loosely formatted page) — read carefully for dates,
titles, and locations rather than expecting a clean listing format.

Only extract events that have a clear specific date. Do not invent or guess a date for an event
that doesn't state one. Return an empty array if the text does not describe any specific events.`;

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

export async function extractWithLargeLLM(largerText, url) {
  if (!largerText?.trim()) return [];

  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 4096,
    },
    contents: `Page URL: ${url}\n\nPage text:\n${largerText}`,
  });

  const raw = response.text?.trim();
  if (!raw) return [];

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }

  return toRows(parsed, url);
}
