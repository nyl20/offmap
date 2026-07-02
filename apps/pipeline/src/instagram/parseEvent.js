import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const VALID_CATEGORIES = [
  'Music', 'Nightlife', 'Visual Arts & Museums', 'Arts & Crafts',
  'Arts & Performance', 'Outdoors & Nature', 'Food & Drink',
  'Community & Culture', 'Talks & Education', 'Wellness', 'Fashion', 'Shopping',
];

const SYSTEM_INSTRUCTION = `You are an event data extractor for an NYC events app.

Given Instagram post content (caption + text extracted from images/videos), extract structured event details.
Resolve relative dates ("this Saturday", "tomorrow", "next week") against the Post date provided.
NYC is the default city for all events.

Return ONLY a valid JSON object matching the schema below, or the string null if the post does not describe a specific upcoming event (e.g. recaps, general lifestyle content, or posts without a clear date).

Schema:
{
  "title": string,
  "description": string | null,
  "start_time": string,        // ISO 8601 with timezone offset, e.g. 2026-07-05T20:00:00-04:00
  "end_time": string | null,
  "venue_name": string | null,
  "venue_address": string | null,
  "price_text": string | null, // e.g. "$20", "Free", "$15–$25"
  "is_free": boolean | null,
  "ticket_url": string | null,
  "categories": string[],      // subset of: ${VALID_CATEGORIES.join(', ')}
  "tags": string[]             // 3–8 freeform descriptive tags
}`;

/**
 * Parses an Instagram post into a structured event object using Gemini.
 * Returns null if the post doesn't describe a clear upcoming event.
 */
export async function parseEvent({ caption, extractedMediaText, postTimestamp, username }) {
  const parts = [];
  if (caption)            parts.push(`Caption:\n${caption}`);
  if (extractedMediaText) parts.push(`Text from images/video:\n${extractedMediaText}`);
  parts.push(`Post date: ${postTimestamp}`);
  parts.push(`Posted by: @${username}`);

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    config: { systemInstruction: SYSTEM_INSTRUCTION },
    contents: parts.join('\n\n'),
  });

  const raw = response.text?.trim() ?? 'null';

  if (raw === 'null') return null;

  // Parse JSON — handle optional markdown code fences from the model
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\n?([\s\S]+?)\n?```/);
    if (!fenced) return null;
    try {
      parsed = JSON.parse(fenced[1]);
    } catch {
      return null;
    }
  }

  // Filter categories to the controlled vocab
  if (Array.isArray(parsed.categories)) {
    parsed.categories = parsed.categories.filter(c => VALID_CATEGORIES.includes(c));
  } else {
    parsed.categories = [];
  }

  return parsed;
}
