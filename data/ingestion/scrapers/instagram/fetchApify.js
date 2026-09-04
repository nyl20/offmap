import { ApifyClient } from 'apify-client';
import { join } from 'path';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(PROJECT_ROOT, 'config', 'instagram_accounts.json');

const ACTOR_ID = 'apify/instagram-post-scraper';
const POSTS_PER_ACCOUNT = 10;

/** Collects an item's media URLs (image(s) or video) directly from the Apify response — no download. */
function collectMediaUrls(item) {
  const nodes = Array.isArray(item.childPosts) && item.childPosts.length
    ? item.childPosts
    : [item];

  const mediaUrls = [];
  for (const node of nodes) {
    const url = node.videoUrl ?? node.displayUrl ?? node.imageUrl;
    if (url) mediaUrls.push(url);
  }

  return mediaUrls;
}

/**
 * Runs the Apify Instagram post scraper for all configured accounts and
 * returns posts normalized to the same shape the old fetch.py emitted:
 * { shortcode, username, caption, timestamp, media_type, media_urls, post_url }.
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

    const mediaUrls = collectMediaUrls(item);

    posts.push({
      shortcode,
      username,
      caption: item.caption ?? '',
      timestamp: item.timestamp,
      media_type: item.type ?? (mediaUrls.length > 1 ? 'Sidecar' : 'Image'),
      media_urls: mediaUrls,
      post_url: item.url ?? `https://www.instagram.com/p/${shortcode}/`,
    });
  }

  return posts;
}
