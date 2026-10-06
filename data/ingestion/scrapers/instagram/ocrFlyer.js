// Flyer OCR enrichment for Instagram posts — transcribes any event-relevant
// text baked into a post's cover/flyer image (date, time, venue, price) so
// parseEvent.js isn't limited to whatever the caption itself says. A post
// whose caption is just "tonight 🔥🔥🔥" with all the actual details in the
// flyer graphic would otherwise yield nothing.
//
// Mirrors scrapers/genericurl/extract/llmSmall.js's Gemini client setup,
// reusing the same GEMINI_API_KEY already configured for this project.
//
// Pinned to gemini-3.5-flash-lite specifically (not the `-latest` alias
// pattern used elsewhere in genericurl/) per explicit instruction — do not
// swap models here without checking back first.

import { GoogleGenAI, createUserContent, createPartFromBase64 } from '@google/genai';

const MODEL = 'gemini-3.5-flash-lite';

// Constructed lazily so importing this file doesn't throw when
// GEMINI_API_KEY is unset — matches the lazy-client pattern in
// scrapers/instagram/parseEvent.js.
let ai;
function getClient() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

const SYSTEM_INSTRUCTION = `You transcribe text visible in an image from an Instagram post advertising
an event, for an events-map app.

Read the image and transcribe only text relevant to the event itself: title, date, time, venue
name, address, price, and ticket/RSVP info. Ignore decorative text, hashtags, handles, and
watermarks. Output plain text only — no formatting, no commentary. If the image contains no
event-relevant text, output nothing.`;

function guessMimeType(url) {
  const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Downloads a post's cover/flyer image and asks Gemini to transcribe any
 * event-relevant on-screen text. Returns null on any failure (missing URL,
 * fetch error, empty model response) — non-fatal, matches the per-post
 * try/catch already in instagram.js's caller.
 */
export async function extractFlyerText(imageUrl) {
  if (!imageUrl) return null;

  let base64Data;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    base64Data = buffer.toString('base64');
  } catch (err) {
    console.error(`[instagram/ocrFlyer] image fetch failed: ${err.message}`);
    return null;
  }

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 512,
      },
      contents: createUserContent([
        'Transcribe any event-relevant text visible in this image.',
        createPartFromBase64(base64Data, guessMimeType(imageUrl)),
      ]),
    });

    const text = response.text?.trim();
    return text || null;
  } catch (err) {
    console.error(`[instagram/ocrFlyer] Gemini OCR failed: ${err.message}`);
    return null;
  }
}
