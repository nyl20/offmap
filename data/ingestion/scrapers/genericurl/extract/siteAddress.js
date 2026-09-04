// Best-effort fallback for a venue's own name/address when an extraction
// tier found real events but no location — most notably the Elfsight
// event-calendar adapter, whose event records carry no location field at
// all. Reads only what the site itself already prints in its own HTML;
// never invents or guesses an address. Verified live against
// bibliothequenyc.com's own footer ("54 Mercer Street, New York, NY
// 10013") and <title> tag.
//
// Known limitation, left as-is rather than over-built: an event whose own
// description names a different physical location (e.g. an "off-site"
// event hosted at another venue — a real case found live on
// bibliothequenyc.com) still gets backfilled with the PAGE's own address,
// which is wrong for that one row. The description text itself stays
// intact for a human reviewer to catch; parsing a location out of
// free-text descriptions is a much deeper problem this fallback isn't
// trying to solve.

const US_ADDRESS_RE = /\b\d{1,5}\s+[A-Za-z0-9.'\s]{2,40}?,\s*[A-Za-z\s]{2,30},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/;

export function findAddressInText(text) {
  const match = (text ?? '').match(US_ADDRESS_RE);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

export function findSiteNameFromTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  if (!match) return null;
  const name = match[1].split(/[|\-–—]/)[0].trim();
  return name || null;
}
