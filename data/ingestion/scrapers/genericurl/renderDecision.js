// Headless-rendering decision. Playwright is deliberately NOT added as a
// dependency yet (see plan) — neither of the two example target sites this
// pipeline was designed against turned out to need it (Luma has a plain-
// HTTP shadow API; bibliothequenyc.com doesn't appear to publish events on
// its own site at all), so adding the single most expensive resource in
// this design before a real site proves it necessary would be exactly the
// kind of "escalate just in case" this pipeline is built to avoid.
//
// needsHeadlessRender() is still fully implemented and wired into
// pipeline.js — the decision logic exists and is tested against real HTML —
// only the actual browser launch is stubbed, so hitting this path today
// produces a clear, loud, non-crashing signal (reason code
// render_unsupported) rather than either crashing the run or silently
// guessing at data that was never fetched.

const EMPTY_ROOT_RE = /<div[^>]+id=["'](root|app|__next)["']/i;
const SPA_BUNDLE_RE = /_next\/static|\/static\/js\/main\.[a-z0-9]+\.js|vite\/client|assets\/index-[a-z0-9]+\.js/i;

function bodyTextLength(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!match) return 0;
  return match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

// Escalate only when the plain-fetch result shows a concrete empty-shell
// signature AND detection couldn't reach a confident yes/no on its own —
// never on a flat "no" (nothing to render), never on a confident "yes"
// (already have what's needed).
export function needsHeadlessRender(html, detection) {
  if (!detection || detection.verdict !== 'maybe') return { needed: false, reasonCode: null };

  const textLen = bodyTextLength(html);
  const hasEmptyRoot = EMPTY_ROOT_RE.test(html) && textLen < 200;
  const hasSparseBundlePage = SPA_BUNDLE_RE.test(html) && textLen < 500;

  if (hasEmptyRoot || hasSparseBundlePage) {
    return { needed: true, reasonCode: null };
  }
  return { needed: false, reasonCode: null };
}

export async function renderHeadless(_url) {
  const err = new Error(
    'Headless rendering is not implemented yet — deferred until a real source ' +
    'demonstrates the cheaper paths (adapters, shadow APIs, plain fetch + LLM) ' +
    'cannot get its data. See docs/plan for the reasoning.'
  );
  err.reasonCode = 'render_unsupported';
  throw err;
}
