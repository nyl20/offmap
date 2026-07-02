// Thrillist scraper — NOT YET IMPLEMENTED
//
// Why: thrillist.com/new-york (user-provided URL) and thrillist.com/entertainment/new-york
// both return 404. The site restructured its URL scheme and the correct path for
// NYC events is unknown. WebFetch also blocks the domain entirely.
//
// Path forward:
// 1. Visit thrillist.com in a browser and find the current NYC events/things-to-do URL.
// 2. Check if __NEXT_DATA__ or JSON-LD is present on that page.
// 3. Update this file with the correct URL and selectors.

export const name   = 'thrillist';
export const envKey = null;

export async function fetchEvents() {
  console.warn('[thrillist] scraper not yet implemented — see src/scrapers/thrillist.js for details');
  return [];
}
