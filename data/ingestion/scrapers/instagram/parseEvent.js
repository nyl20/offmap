import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const VALID_CATEGORIES = [
  'Music', 'Nightlife', 'Visual Arts & Museums', 'Arts & Crafts',
  'Arts & Performance', 'Outdoors & Nature', 'Food & Drink',
  'Community & Culture', 'Talks & Education', 'Wellness', 'Fashion', 'Shopping',
];

const SYSTEM_INSTRUCTION = `You are an event data extractor for an NYC events app.

Given Instagram post content (caption + text extracted from images/videos), extract structured
details for every distinct upcoming event described in the post. A post may describe zero events
(e.g. recaps, general lifestyle content), one event, or several (e.g. a roundup/listicle of NYC
happenings) — extract each one separately.
Resolve relative dates ("this Saturday", "tomorrow", "next week") against the Post date provided.
NYC is the default city for all events.

Return a JSON array of event objects, one per distinct event. Return an empty array if the post
does not describe any specific upcoming events.`;

const EVENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title:         { type: Type.STRING },
    description:   { type: Type.STRING, nullable: true },
    start_time:    { type: Type.STRING, description: 'ISO 8601 with timezone offset, e.g. 2026-07-05T20:00:00-04:00' },
    end_time:      { type: Type.STRING, nullable: true },
    venue_name:    { type: Type.STRING, nullable: true },
    venue_address: { type: Type.STRING, nullable: true },
    price_text:    { type: Type.STRING, nullable: true, description: 'e.g. "$20", "Free", "$15-$25"' },
    is_free:       { type: Type.BOOLEAN, nullable: true },
    ticket_url:    { type: Type.STRING, nullable: true },
    categories:    { type: Type.ARRAY, items: { type: Type.STRING, enum: VALID_CATEGORIES } },
    tags:          { type: Type.ARRAY, items: { type: Type.STRING }, description: '3-8 freeform descriptive tags' },
  },
  required: ['title', 'start_time'],
};

const RESPONSE_SCHEMA = { type: Type.ARRAY, items: EVENT_SCHEMA };

/**
 * Parses an Instagram post into zero or more structured event objects using Gemini.
 * Returns an empty array if the post doesn't describe any clear upcoming events.
 */
export async function parseEvents({ caption, extractedMediaText, postTimestamp, username }) {
  const parts = [];
  if (caption)            parts.push(`Caption:\n${caption}`);
  if (extractedMediaText) parts.push(`Text from images/video:\n${extractedMediaText}`);
  parts.push(`Post date: ${postTimestamp}`);
  parts.push(`Posted by: @${username}`);

  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      // Roundup posts can list a dozen+ events — the default output limit is
      // too small for that and truncates mid-JSON.
      maxOutputTokens: 8192,
    },
    contents: parts.join('\n\n'),
  });

  const raw = response.text?.trim();
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Response got truncated even at the higher token limit — skip this
    // post's events rather than throwing away partially-valid JSON.
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  // Defensive filter — schema enum strongly constrains categories but isn't
  // an absolute guarantee, and this feeds directly into the DB's category column.
  return parsed.map(event => ({
    ...event,
    categories: Array.isArray(event.categories)
      ? event.categories.filter(c => VALID_CATEGORIES.includes(c))
      : [],
  }));
}
