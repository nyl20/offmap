import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { extractMedia } from './instagram/extractMedia.js';
import { parseEvent } from './instagram/parseEvent.js';

export const name = 'instagram';
export const envKey = 'INSTAGRAM_USERNAME';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FETCH_SCRIPT = join(__dirname, 'instagram', 'fetch.py');
const PROJECT_ROOT = join(__dirname, '..');

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

/** Spawns fetch.py and collects all JSONL post records from its stdout. */
async function fetchPosts() {
  const extraArgs = process.argv.includes('--dry-run') ? ['--dry-run'] : [];

  const py = spawn('python3', [FETCH_SCRIPT, ...extraArgs], {
    cwd: PROJECT_ROOT,
    env: process.env,
  });

  return new Promise((resolve, reject) => {
    const posts = [];
    const rl = createInterface({ input: py.stdout });

    rl.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        posts.push(JSON.parse(trimmed));
      } catch {
        // non-JSON line — ignore
      }
    });

    py.stderr.on('data', data => {
      process.stdout.write(`[instagram] ${data.toString()}`);
    });

    py.on('close', code => {
      if (code !== 0) reject(new Error(`fetch.py exited with code ${code}`));
      else resolve(posts);
    });

    py.on('error', err => reject(new Error(`failed to spawn fetch.py: ${err.message}`)));
  });
}

export async function fetchEvents() {
  const posts = await fetchPosts();
  console.log(`[instagram] ${posts.length} new posts to process`);

  const events = [];

  for (const post of posts) {
    try {
      const extractedText = await extractMedia(post.media_paths ?? []);

      const parsed = await parseEvent({
        caption:           post.caption,
        extractedMediaText: extractedText,
        postTimestamp:     post.timestamp,
        username:          post.username,
      });

      // Skip if Claude found no event or required fields are missing
      if (!parsed?.title || !parsed?.start_time || !parsed?.venue_name) continue;

      // Use first non-video CDN URL as the event image (Instagram CDN URLs expire
      // but are useful during the moderation review window)
      const firstImageUrl = (post.media_urls ?? []).find(u => {
        const ext = (u.split('?')[0].split('.').pop() ?? '').toLowerCase();
        return IMAGE_EXTENSIONS.has(ext);
      }) ?? null;

      events.push({
        title:            parsed.title,
        description:      parsed.description ?? null,
        start_time:       parsed.start_time,
        end_time:         parsed.end_time ?? null,
        venue_name:       parsed.venue_name,
        venue_address:    parsed.venue_address ?? `${parsed.venue_name}, New York, NY`,
        venue_city:       'New York',
        venue_region:     'NY',
        venue_country:    'US',
        timezone:         'America/New_York',
        category:         null,
        tags:             Array.isArray(parsed.tags) ? parsed.tags : [],
        price_text:       parsed.price_text ?? null,
        is_free:          parsed.is_free === true ? 'true' : parsed.is_free === false ? 'false' : null,
        ticket_url:       parsed.ticket_url ?? null,
        source_url:       post.post_url,
        source_name:      `instagram/@${post.username}`,
        image_url:        firstImageUrl,
        confidence_score: 0.65,
        review_status:    'needs_review',
      });
    } catch (err) {
      console.error(`[instagram] error processing ${post.shortcode}: ${err.message}`);
    }
  }

  return events;
}
