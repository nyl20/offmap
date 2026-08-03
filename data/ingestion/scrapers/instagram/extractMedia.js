import { GoogleGenAI } from '@google/genai';
import { readFileSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { extname, join } from 'path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'webm', 'm4v']);

const VISION_PROMPT =
  'Extract all visible text from this image. ' +
  'If this is an event flyer or announcement, prioritize: ' +
  'event name, date, time, location/venue, ticket price, and any URLs. ' +
  'Return only the extracted text with no commentary.';

async function extractImageText(imagePath) {
  let imageData;
  try {
    imageData = readFileSync(imagePath).toString('base64');
  } catch {
    return '';
  }

  const ext = extname(imagePath).slice(1).toLowerCase();
  const mimeType = ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : 'image/jpeg';

  const response = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageData } },
        { text: VISION_PROMPT },
      ],
    }],
  });

  return response.text?.trim() ?? '';
}

async function extractVideoText(videoPath) {
  const framesDir = `/tmp/instagram_frames/${Date.now()}`;
  mkdirSync(framesDir, { recursive: true });

  try {
    // 1 frame every 10 seconds — enough for typical event reels
    execSync(
      `ffmpeg -i "${videoPath}" -vf fps=0.1 "${framesDir}/frame_%03d.jpg" -loglevel error`,
      { timeout: 60_000 },
    );
  } catch (err) {
    console.error(`[extractMedia] ffmpeg failed for ${videoPath}: ${err.message}`);
    return '';
  }

  let frames;
  try {
    frames = readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort().map(f => join(framesDir, f));
  } catch {
    return '';
  }

  if (!frames.length) return '';

  const texts = await Promise.all(frames.map(f => extractImageText(f)));
  return texts.filter(Boolean).join('\n');
}

/**
 * Extracts all visible text from a list of local media file paths.
 * Images → Gemini Vision; videos → ffmpeg keyframes → Gemini Vision.
 * Returns concatenated text, or empty string if nothing is found.
 */
export async function extractMedia(mediaPaths) {
  if (!mediaPaths?.length) return '';

  const texts = [];
  for (const path of mediaPaths) {
    const ext = extname(path).slice(1).toLowerCase();
    try {
      if (VIDEO_EXTENSIONS.has(ext)) {
        texts.push(await extractVideoText(path));
      } else {
        texts.push(await extractImageText(path));
      }
    } catch (err) {
      console.error(`[extractMedia] error processing ${path}: ${err.message}`);
    }
  }

  return texts.filter(Boolean).join('\n---\n');
}
