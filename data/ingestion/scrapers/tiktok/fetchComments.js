// Fetches top comments for a TikTok video via TikTok's internal comment-list
// endpoint. Confirmed live during planning: it 200s with real comment data
// given just aweme_id + aid=1988 (TikTok's own web app id) + locale params —
// no signature/msToken required today. This is the same "unofficial but
// public, no auth bypass" risk tier as the page scrape in fetchPost.js, not
// a new one — but it's undocumented, so treat any failure as "no comments"
// rather than failing the whole import (TikTok could add a signature
// requirement, rate-limit, or change the response shape at any time).
//
// IMPORTANT — comments are a noisy signal, not ground truth. Testing found a
// top-liked comment that named a *different, similar* venue for comparison
// ("X is a more affordable version") rather than confirming the video's own
// location. This module only fetches and lightly ranks comments; it does
// NOT decide what they mean — that judgment (comparison vs. confirmation)
// belongs to parseEvent.js's extraction prompt, which is told explicitly
// which comments (if any) came from the video's own creator.

const COMMENT_LIST_URL = 'https://www.tiktok.com/api/comment/list/';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_COMMENTS = 20;

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Fetches up to MAX_COMMENTS top comments for a video, tagging which ones
 * were authored by the video's own creator (a creator's reply to "where is
 * this?" is a much higher-trust signal than a generic top-liked comment).
 * Returns [] on ANY failure — a broken/blocked comment fetch degrades the
 * import to caption+hashtags only rather than failing it.
 *
 * Returns [{ text, diggCount, isCreatorReply }]
 */
export async function fetchComments(awemeId, authorUid) {
  const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const url = `${COMMENT_LIST_URL}?aweme_id=${encodeURIComponent(awemeId)}`
      + `&count=${MAX_COMMENTS}&cursor=0&aid=1988&app_language=en&region=US`;

    const res = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Referer: `https://www.tiktok.com/`,
      },
    });

    if (!res.ok) {
      console.warn(`[tiktok] comment fetch failed: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (data.status_code !== 0 || !Array.isArray(data.comments)) {
      console.warn(`[tiktok] comment fetch returned status_code ${data.status_code} — endpoint may need auth now`);
      return [];
    }

    return data.comments
      .map(c => ({
        text: c.text ?? '',
        diggCount: c.digg_count ?? 0,
        isCreatorReply: authorUid != null && String(c.user?.uid ?? c.user?.id ?? '') === String(authorUid),
      }))
      .filter(c => c.text.trim().length > 0)
      .sort((a, b) => b.diggCount - a.diggCount);
  } catch (err) {
    console.warn(`[tiktok] comment fetch error: ${err.message}`);
    return [];
  } finally {
    cancel();
  }
}
