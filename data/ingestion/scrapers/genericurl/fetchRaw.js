// Cheapest possible data-acquisition stage: a single plain HTTP fetch. Every
// other stage in this pipeline (detection, adapters, deterministic
// extraction, the render-mode decision) works from this result first —
// nothing more expensive runs until this has been tried and found wanting.

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Anything not caught by fetch() throwing (DNS failure, timeout) — the
// caller classifies non-2xx status itself rather than this module deciding
// what a given status code means for a given source.
export async function fetchHtml(url, { timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: controller.signal });
    const html = await res.text();
    return {
      html,
      status: res.status,
      ok: res.ok,
      finalUrl: res.url || url,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Plain JSON GET for shadow-API calls (e.g. Luma's api.lu.ma). Kept separate
// from fetchHtml() since callers need res.json(), not res.text().
export async function fetchJson(url, { timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Accept': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    let data;
    try { data = await res.json(); } catch { return { ok: false, status: res.status, data: null }; }
    return { ok: true, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}
