// Dice.fm scraper — NOT YET IMPLEMENTED
//
// Why: dice.fm/browse auto-detects city via IP geolocation and has no stable
// NYC-specific URL (e.g. /browse/new-york returns 404). Their public __NEXT_DATA__
// populates with the detected city (Detroit, London, etc.) rather than NYC.
//
// Path forward: Dice has an undocumented REST API used by their mobile app.
// Intercept network traffic in the Dice iOS/Android app to find the endpoint
// (likely https://api.dice.fm/v1/events?location=new-york or similar), then
// implement a scraper using that endpoint.

export const name   = 'dice';
export const envKey = null;

export async function fetchEvents() {
  console.warn('[dice] scraper not yet implemented — see src/scrapers/dice.js for details');
  return [];
}
