import fetch from 'node-fetch';
import { extractDate, extractTime, extractPrice, extractAgeRestriction } from './utils.js';

export const name = 'reddit';
// Reddit requires a free OAuth "script" app: reddit.com/prefs/apps → create app → script type
// Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env to enable this scraper.
export const envKey = 'REDDIT_CLIENT_ID';

const SUBREDDITS = ['nycevents'];
const SKIP_RE    = /\b(weekly|megathread|roundup|recommendations?|what'?s\s+on|discussion|ama|monthly)\b/i;
const USER_AGENT = 'nodejs:nyc-mapapp:1.0 (by mapapp-scraper)';

async function getOAuthToken() {
  const id     = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET ?? '';
  const creds  = Buffer.from(`${id}:${secret}`).toString('base64');

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Reddit OAuth failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`Reddit OAuth: no token in response`);
  return data.access_token;
}

function cleanTitle(title) {
  // Remove flair prefixes like "[Free]", "[Event]"
  return title.replace(/^\[.*?\]\s*/, '').trim();
}

function extractVenue(title) {
  const m = title.match(/\b(?:at|@)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s'&.\-]{2,40}?)(?:\s*[–\-|,]|\s+(?:on|this|every|for)\s+|\s*$)/);
  return m ? m[1].trim() : null;
}

async function fetchSubredditPosts(sub, token) {
  const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`Reddit r/${sub} → HTTP ${res.status}`);
  const json = await res.json();
  return json?.data?.children?.map(c => c.data) ?? [];
}

export async function fetchEvents() {
  const token = await getOAuthToken();
  const rows  = [];

  for (const sub of SUBREDDITS) {
    let posts;
    try {
      posts = await fetchSubredditPosts(sub, token);
    } catch (err) {
      console.warn(`[reddit] r/${sub} failed: ${err.message}`);
      continue;
    }

    for (const post of posts) {
      if (SKIP_RE.test(post.title)) continue;

      const fullText = `${post.title}\n${post.selftext ?? ''}`;
      const dateStr  = extractDate(fullText);
      if (!dateStr) continue;

      const time          = extractTime(fullText) ?? '20:00:00';
      const venue         = extractVenue(post.title);
      const { price_text, is_free } = extractPrice(fullText);
      const sourceUrl     = post.is_self
        ? `https://reddit.com${post.permalink}`
        : post.url;

      rows.push({
        title:         cleanTitle(post.title),
        external_id:   post.id ?? null,
        venue_name:    venue ?? 'New York City',
        venue_address: 'New York, NY',
        venue_lat:     null,
        venue_lng:     null,
        start_time:    `${dateStr}T${time}`,
        end_time:      null,
        timezone:      'America/New_York',
        category:      post.link_flair_text ?? null,
        tags:          [],
        description:   post.selftext?.slice(0, 500) ?? null,
        price_text,
        is_free,
        age_restriction: extractAgeRestriction(fullText),
        image_url:     null,
        source_url:    sourceUrl,
        source_name:   `Reddit r/${sub}`,
        confidence_score: 0.4,
        review_status: 'needs_review',
      });
    }
  }

  return rows;
}
