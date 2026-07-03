// The Metropolitan Museum of Art — NOT YET IMPLEMENTED
//
// Why: metmuseum.org/events returns Vercel Security Checkpoint (429/403).
// The Met's public API (metmuseum.org/api) covers collections (artwork), not events.
//
// Path forward:
// Their public Collections API docs: https://metmuseum.github.io/
// For events specifically, try scraping with headless browser (Playwright/Puppeteer)
// or check if they publish an iCal/RSS feed at metmuseum.org/events.ics or similar.

export const name   = 'met';
export const envKey = null;

export async function fetchEvents() {
  console.warn('[met] not yet implemented — see src/scrapers/met.js for details');
  return [];
}
