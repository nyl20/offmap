// Brooklyn Museum scraper — NOT YET IMPLEMENTED
//
// Why: brooklynmuseum.org returns Vercel Security Checkpoint (429) for automated
// requests. Their public API (api.brooklynmuseum.org) requires an API key.
//
// Path forward (two options):
// 1. Request a free API key at: brooklynmuseum.org/opencollection/api
//    Then use: GET https://api.brooklynmuseum.org/api/v2/event/?api_version=v2
//    Set BROOKLYN_MUSEUM_API_KEY in .env and implement here.
//
// 2. If the Vercel checkpoint relaxes, try scraping:
//    https://www.brooklynmuseum.org/calendar  with browser headers.

export const name   = 'brooklynmuseum';
export const envKey = null;

export async function fetchEvents() {
  console.warn('[brooklynmuseum] not yet implemented — see src/scrapers/brooklynmuseum.js for details');
  return [];
}
