// Hashing helpers for the cache/diff gate. What gets hashed depends on the
// source's render_mode (see pipeline.js): stripped visible text for plain
// HTTP sources, the raw shadow-API JSON body for shadow_api sources, and a
// bundle-fingerprint proxy for headless sources (once that mode exists) —
// never raw unstripped HTML, since ads/CSRF tokens/cache-busting query
// strings change on every request even when the actual content hasn't.

import { createHash } from 'crypto';

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function hashPlainText(text) {
  return sha256((text ?? '').trim());
}

export function hashShadowApiPayload(json) {
  return sha256(JSON.stringify(json ?? null));
}

// Proxy for "has this single-page app been redeployed," used only for
// render_mode='headless' sources, where hashing the plain-fetch shell is
// useless (it's nearly always static regardless of the underlying data).
// Next.js embeds a per-deploy buildId directly in __NEXT_DATA__; other
// bundlers content-hash their output chunk filenames instead. An unchanged
// fingerprint skips a real render on most days; pipeline.js still forces a
// full re-render at least once every 7 days regardless, since a pure
// data-only change (no redeploy) wouldn't move this fingerprint at all —
// an explicit, bounded trade-off, not a guarantee.
export function extractBundleFingerprint(html) {
  const buildIdMatch = html.match(/"buildId":"([^"]+)"/);
  if (buildIdMatch) return buildIdMatch[1];

  const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)].map(m => m[1]);
  return scriptSrcs.length ? sha256(scriptSrcs.sort().join('|')) : null;
}
