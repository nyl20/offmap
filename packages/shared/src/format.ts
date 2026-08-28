const NY_TIME_ZONE = 'America/New_York';

// A handful of scraped sources (nycgovparks, some Eventbrite listings) stamp
// an event as 00:00:00 UTC → 23:59:59 UTC the same or a following day to
// mean "date only, no specific time" rather than a real midnight start —
// detect that pattern and label it "All day" instead of a misleading
// literal time.
function isAllDay(startTime: string, endTime: string | null): boolean {
  const start = new Date(startTime);
  if (start.getUTCHours() !== 0 || start.getUTCMinutes() !== 0) return false;
  if (!endTime) return false;
  const end = new Date(endTime);
  return end.getUTCHours() === 23 && end.getUTCMinutes() >= 55;
}

export function formatEventDateTime(startTime: string, endTime: string | null): string {
  if (isAllDay(startTime, endTime)) {
    const start = new Date(startTime);
    const end = new Date(endTime as string);
    const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' };
    const startDate = new Intl.DateTimeFormat('en-US', dateFmt).format(start);
    const endDate = new Intl.DateTimeFormat('en-US', dateFmt).format(end);
    return startDate === endDate ? `${startDate} · All day` : `${startDate} – ${endDate} · All day`;
  }

  const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: NY_TIME_ZONE };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone: NY_TIME_ZONE };

  const start = new Date(startTime);
  const date = new Intl.DateTimeFormat('en-US', dateFmt).format(start);
  const startTimeLabel = new Intl.DateTimeFormat('en-US', timeFmt).format(start);

  if (!endTime) return `${date} · ${startTimeLabel}`;

  const end = new Date(endTime);
  const endTimeLabel = new Intl.DateTimeFormat('en-US', timeFmt).format(end);
  return `${date} · ${startTimeLabel} – ${endTimeLabel}`;
}

export function formatPrice(priceText: string | null, isFree: boolean): string {
  if (isFree) return 'Free';
  if (!priceText || priceText === '0') return 'See website';
  return priceText;
}

// Matches bare 24-hour HH:MM tokens (e.g. the "13:00"/"18:00" in "We-Su
// 13:00-18:00") without touching day-range tokens like "We-Su" or "PH".
const TIME_TOKEN = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;

function to12Hour(hh: string, mm: string): string {
  const h = Number(hh);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

// venue_opening_hours is free text scraped from OSM (usually OSM
// opening_hours syntax, e.g. "We-Su 13:00-18:00") — this is a best-effort
// passthrough, not a full opening_hours parser. Tidies the semicolon
// separators used to join multiple day-ranges, and converts 24-hour time
// tokens to 12-hour AM/PM (this app displays times in 12-hour form
// everywhere else — see formatEventDateTime — so raw military time here
// would be inconsistent).
export function formatVenueHours(openingHours: string | null): string | null {
  if (!openingHours) return null;
  return openingHours.replace(/;\s*/g, '  ·  ').replace(TIME_TOKEN, (_match, hh, mm) => to12Hour(hh, mm));
}

export function getCurrentWeekdayLabel(): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: NY_TIME_ZONE }).format(new Date());
}

export function buildDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
