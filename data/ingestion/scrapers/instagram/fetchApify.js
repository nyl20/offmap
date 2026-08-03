import { ApifyClient } from 'apify-client';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'instagram_accounts.json');
const MEDIA_DIR = '/tmp/instagram_media';

const ACTOR_ID = 'apify/instagram-post-scraper';
const POSTS_PER_ACCOUNT = 10;

async function downloadFile(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

/** Downloads an item's media (image(s) or video) to a local dir; returns { mediaPaths, mediaUrls }. */
async function downloadItemMedia(item, destDir) {
  const mediaPaths = [];
  const mediaUrls = [];

  const nodes = Array.isArray(item.childPosts) && item.childPosts.length
    ? item.childPosts
    : [item];

  await mkdir(destDir, { recursive: true });

  for (const [i, node] of nodes.entries()) {
    const isVideo = Boolean(node.videoUrl);
    const url = isVideo ? node.videoUrl : (node.displayUrl ?? node.imageUrl);
    if (!url) continue;

    const dest = join(destDir, isVideo ? `video_${i}.mp4` : `image_${i}.jpg`);
    try {
      await downloadFile(url, dest);
      mediaPaths.push(dest);
      mediaUrls.push(url);
    } catch (err) {
      console.error(`[fetchApify] media download failed for ${url}: ${err.message}`);
    }
  }

  return { mediaPaths, mediaUrls };
}

/**
 * Runs the Apify Instagram post scraper for all configured accounts and
 * returns posts normalized to the same shape the old fetch.py emitted:
 * { shortcode, username, caption, timestamp, media_type, media_paths, media_urls, post_url }.
 */
export async function fetchApifyPosts() {
  const { accounts = [] } = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  if (!accounts.length) {
    console.log('[fetchApify] no accounts configured in config/instagram_accounts.json');
    return [];
  }

  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

  console.log(`[fetchApify] running ${ACTOR_ID} for ${accounts.length} accounts (latest ${POSTS_PER_ACCOUNT} posts each)…`);
  const run = await client.actor(ACTOR_ID).call({
    username: accounts,
    resultsLimit: POSTS_PER_ACCOUNT,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[fetchApify] ${items.length} posts returned`);

  const posts = [];
  for (const item of items) {
    const username = item.ownerUsername ?? item.username;
    const shortcode = item.shortCode ?? item.shortcode;
    if (!username || !shortcode) continue;

    const destDir = join(MEDIA_DIR, `${username}_${shortcode}`);
    let media = { mediaPaths: [], mediaUrls: [] };
    try {
      media = await downloadItemMedia(item, destDir);
    } catch (err) {
      console.error(`[fetchApify] ${username}/${shortcode}: media download failed — ${err.message}`);
    }

    posts.push({
      shortcode,
      username,
      caption: item.caption ?? '',
      timestamp: item.timestamp,
      media_type: item.type ?? (media.mediaPaths.length > 1 ? 'Sidecar' : 'Image'),
      media_paths: media.mediaPaths,
      media_urls: media.mediaUrls,
      post_url: item.url ?? `https://www.instagram.com/p/${shortcode}/`,
    });
  }

  return posts;
}
