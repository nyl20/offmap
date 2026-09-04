import Groq from 'groq-sdk';

// Constructed lazily (not at module load) so importing this file doesn't
// throw when GROQ_API_KEY is unset — e.g. while the Instagram scraper is
// paused and unregistered in pipelines/runner.js but still imported there.
let groq;
function getGroqClient() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

const VALID_CATEGORIES = [
  'Music', 'Nightlife', 'Visual Arts & Museums', 'Arts & Crafts',
  'Arts & Performance', 'Outdoors & Nature', 'Food & Drink',
  'Community & Culture', 'Talks & Education', 'Wellness', 'Fashion', 'Shopping',
];

const SYSTEM_INSTRUCTION = `You are an event data extractor for an NYC events app.

Given an Instagram post caption, extract structured
details for every distinct upcoming event described in the post. A post may describe zero events
(e.g. recaps, general lifestyle content), one event, or several (e.g. a roundup/listicle of NYC
happenings) — extract each one separately.
Resolve relative dates ("this Saturday", "tomorrow", "next week") against the Post date provided.
NYC is the default city for all events.

Return a JSON object with an "events" array, one entry per distinct event. Return an empty array
if the post does not describe any specific upcoming events.`;

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    title:         { type: 'string' },
    description:   { type: ['string', 'null'] },
    start_time:    { type: 'string', description: 'ISO 8601 with timezone offset, e.g. 2026-07-05T20:00:00-04:00' },
    end_time:      { type: ['string', 'null'] },
    venue_name:    { type: ['string', 'null'] },
    venue_address: { type: ['string', 'null'] },
    price_text:    { type: ['string', 'null'], description: 'e.g. "$20", "Free", "$15-$25"' },
    is_free:       { type: ['boolean', 'null'] },
    ticket_url:    { type: ['string', 'null'] },
    categories:    { type: 'array', items: { type: 'string', enum: VALID_CATEGORIES } },
    tags:          { type: 'array', items: { type: 'string' }, description: '3-8 freeform descriptive tags' },
  },
  required: [
    'title', 'description', 'start_time', 'end_time', 'venue_name', 'venue_address',
    'price_text', 'is_free', 'ticket_url', 'categories', 'tags',
  ],
  additionalProperties: false,
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    events: { type: 'array', items: EVENT_SCHEMA },
  },
  required: ['events'],
  additionalProperties: false,
};

/**
 * Parses an Instagram post into zero or more structured event objects using Groq.
 * Returns an empty array if the post doesn't describe any clear upcoming events.
 */
export async function parseEvents({ caption, postTimestamp, username }) {
  const parts = [];
  if (caption) parts.push(`Caption:\n${caption}`);
  parts.push(`Post date: ${postTimestamp}`);
  parts.push(`Posted by: @${username}`);

  const response = await getGroqClient().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: parts.join('\n\n') },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'events_response', strict: true, schema: RESPONSE_SCHEMA },
    },
    // Roundup posts can list a dozen+ events — the default output limit is
    // too small for that and truncates mid-JSON.
    max_completion_tokens: 8192,
  });

  const raw = response.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Response got truncated even at the higher token limit — skip this
    // post's events rather than throwing away partially-valid JSON.
    return [];
  }

  const events = Array.isArray(parsed?.events) ? parsed.events : [];

  // Defensive filter — schema enum strongly constrains categories but isn't
  // an absolute guarantee, and this feeds directly into the DB's category column.
  return events.map(event => ({
    ...event,
    categories: Array.isArray(event.categories)
      ? event.categories.filter(c => VALID_CATEGORIES.includes(c))
      : [],
  }));
}
