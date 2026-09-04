// Resolves whatever TikTok URL shape a user pastes (a short link like
// vm.tiktok.com/XXXX or tiktok.com/t/XXXX, or an already-canonical
// /@user/video/{id} link) to the canonical video URL and its numeric id.
//
// TikTok short links redirect with a plain HTTP 301/302 — no JS execution
// needed, confirmed live against https://www.tiktok.com/t/ZTUdtvcAW/ during
// planning. A HEAD request is enough to read the Location chain; falling
// back to GET covers any host that doesn't respond to HEAD.

const CANONICAL_VIDEO_RE = /tiktok\.com\/@[^/]+\/video\/(\d+)/;
const FETCH_TIMEOUT_MS = 10_000;

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Resolves a pasted TikTok URL to { canonicalUrl, awemeId }.
 * Throws if the URL isn't a tiktok.com host, or if it can't be resolved to a
 * canonical /@user/video/{id} link.
 */
export async function resolveTikTokLink(inputUrl) {
  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error(`not a valid URL: ${inputUrl}`);
  }

  if (!/(^|\.)tiktok\.com$/.test(parsed.hostname)) {
    throw new Error(`not a tiktok.com URL: ${inputUrl}`);
  }

  const directMatch = parsed.href.match(CANONICAL_VIDEO_RE);
  if (directMatch) {
    return { canonicalUrl: parsed.href, awemeId: directMatch[1] };
  }

  // HEAD avoids downloading the full page body just to read where it
  // redirects to — fetchPost.js does the real GET afterward. Some hosts
  // reject HEAD, so fall back to GET on any non-2xx/3xx-ish failure.
  for (const method of ['HEAD', 'GET']) {
    const { signal, cancel } = withTimeout(FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(parsed.href, {
        method,
        redirect: 'follow',
        signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
      });

      const finalUrl = res.url;
      const match = finalUrl.match(CANONICAL_VIDEO_RE);
      if (match) return { canonicalUrl: finalUrl, awemeId: match[1] };
      if (method === 'GET') {
        throw new Error(`could not resolve to a canonical video URL, landed on: ${finalUrl}`);
      }
      // HEAD landed somewhere unrecognized — try GET before giving up.
    } finally {
      cancel();
    }
  }

  throw new Error(`could not resolve TikTok link: ${inputUrl}`);
}
