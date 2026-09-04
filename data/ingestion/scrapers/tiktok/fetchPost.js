// Fetches a TikTok video's metadata via the same "embedded-JSON" scrape
// tier already used for Luma/Partiful (scrapers/luma.js, scrapers/partiful.js)
// — GET the canonical page and parse the JSON TikTok itself hydrates the
// page from, rather than reverse-engineering any private API.
//
// Confirmed live during planning: the page's
// __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag contains itemStruct with
// desc (caption), textExtra (hashtag entities), diversificationLabels /
// suggestedWords (TikTok's own topic classifier output), locationCreated
// (country only), and — when the creator tagged one — a `poi` object with a
// name/address/category that's far more reliable than anything inferred
// from text. Falls back to the official oembed endpoint (no auth, always
// stable, but caption/author/thumbnail only) if the page's markup doesn't
// match the expected shape, since this is unofficial and could change.

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function extractItemStruct(html) {
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return null;

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }

  return data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ?? null;
}

async function fetchOembedFallback(canonicalUrl) {
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`oembed fetch failed: ${res.status}`);
    const data = await res.json();

    return {
      caption: data.title ?? null,
      hashtags: [],
      diversificationLabels: [],
      suggestedWords: [],
      poi: null,
      thumbnailUrl: data.thumbnail_url ?? null,
      authorUsername: data.author_unique_id ?? null,
      authorUid: null,
      source: 'oembed',
    };
  } finally {
    cancel();
  }
}

/**
 * Fetches post metadata for a resolved canonical TikTok video URL.
 * Returns { caption, hashtags, diversificationLabels, suggestedWords, poi,
 *           thumbnailUrl, authorUsername, authorUid, source }
 * `source` is 'page' (full embedded-JSON tier) or 'oembed' (fallback).
 */
export async function fetchPost(canonicalUrl) {
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  let html;
  try {
    const res = await fetch(canonicalUrl, {
      signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`page fetch failed: ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.warn(`[tiktok] page fetch failed (${err.message}), falling back to oembed`);
    return fetchOembedFallback(canonicalUrl);
  } finally {
    cancel();
  }

  const item = extractItemStruct(html);
  if (!item) {
    console.warn('[tiktok] page markup did not match expected shape, falling back to oembed');
    return fetchOembedFallback(canonicalUrl);
  }

  const hashtags = (item.textExtra ?? [])
    .filter(t => t.hashtagName)
    .map(t => t.hashtagName);

  return {
    caption: item.desc ?? null,
    hashtags,
    diversificationLabels: item.diversificationLabels ?? [],
    suggestedWords: item.suggestedWords ?? [],
    poi: item.poi ?? null,
    thumbnailUrl: item.video?.cover ?? item.video?.originCover ?? null,
    authorUsername: item.author?.uniqueId ?? null,
    authorUid: item.author?.id ?? null,
    source: 'page',
  };
}
