import { splitUSAddress } from './utils.js';

export const name   = 'residentadvisor';
export const envKey = null;

const GRAPHQL_URL = 'https://ra.co/graphql';
const NYC_AREA_ID = 8;       // RA's integer area ID for New York City
const PAGE_SIZE   = 50;
const MAX_PAGES   = 5;       // 5 × 50 = 250 events max per run

const NYC = { minLng: -74.26, maxLng: -73.70, minLat: 40.49, maxLat: 40.92 };
function inNYC(lat, lng) {
  return lat >= NYC.minLat && lat <= NYC.maxLat && lng >= NYC.minLng && lng <= NYC.maxLng;
}

const QUERY = `
  query GetNYCEvents($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
    eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
      data {
        event {
          id title date startTime endTime cost contentUrl minimumAge
          venue {
            name address area { name }
            location { latitude longitude }
            country { name }
          }
          images { filename type }
          genres { name }
          artists { name }
          promoters { name }
        }
      }
      totalResults
    }
  }
`;

function normalizeEvent(e) {
  if (!e?.title || !e?.date) return null;

  const venue = e.venue;
  const loc   = venue?.location;
  const lat   = loc?.latitude  ? parseFloat(loc.latitude)  : null;
  const lng   = loc?.longitude ? parseFloat(loc.longitude) : null;
  const hasCoords = lat != null && lng != null && inNYC(lat, lng);

  // Build address from the single venue.address string (RA stores full address as one field)
  const address = venue?.address ?? 'New York, NY';

  // startTime/endTime are already full ISO datetimes, not bare times
  const startTime = e.startTime ?? e.date;
  const endTime   = e.endTime   ?? null;

  // Artists → tags; genres → category
  const artists  = (e.artists ?? []).map(a => a.name).filter(Boolean);
  const genres   = (e.genres  ?? []).map(g => g.name).filter(Boolean);
  const category = genres[0] ?? 'Music'; // RA is primarily electronic/music events

  // images[].filename is already a full CDN URL despite the field name
  const imageUrl = e.images?.find(i => i.type === 'FLYERFRONT')?.filename
                ?? e.images?.[0]?.filename ?? null;

  // Cost text
  const priceText = e.cost?.trim() || null;
  const isFree    = !priceText || /free/i.test(priceText) ? 'true' : 'false';

  // RA event URL
  const sourceUrl = e.contentUrl
    ? `https://ra.co${e.contentUrl}`
    : `https://ra.co/events/${e.id}`;

  // RA stores the full address as one string — best-effort split for structured parts
  const addrParts = splitUSAddress(address);

  return {
    title:         e.title,
    external_id:   e.id ? String(e.id) : null,
    venue_name:    venue?.name ?? 'New York City',
    venue_address: address,
    venue_address_line: addrParts.line,
    venue_city:    addrParts.city,
    venue_region:  addrParts.region,
    venue_postal:  addrParts.postal,
    venue_country: venue?.country?.name === 'United States of America' ? 'US' : (addrParts.country ?? 'US'),
    venue_lat:     hasCoords ? lat : null,
    venue_lng:     hasCoords ? lng : null,
    start_time:    startTime,
    end_time:      endTime,
    timezone:      'America/New_York',
    category,
    tags:          artists.slice(0, 10), // first 10 artists as tags
    description:   null,
    price_text:    priceText,
    is_free:       isFree,
    age_restriction: e.minimumAge ? `${e.minimumAge}+` : null,
    organizer_name: e.promoters?.[0]?.name ?? null,
    image_url:     imageUrl,
    source_url:    sourceUrl,
    source_name:   'Resident Advisor',
    confidence_score: 0.88,
    review_status: 'approved',
  };
}

async function queryPage(page, dateFilter) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://ra.co/events/us/newyork',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        filters: {
          areas: { eq: NYC_AREA_ID },
          listingDate: { gte: dateFilter },
        },
        pageSize: PAGE_SIZE,
        page,
      },
    }),
  });

  if (!res.ok) throw new Error(`RA GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`RA GraphQL error: ${json.errors[0].message}`);
  return json.data?.eventListings ?? { data: [], totalResults: 0 };
}

export async function fetchEvents() {
  const now  = new Date().toISOString();
  const rows = [];

  let totalResults = Infinity;
  let page         = 1;

  while (page <= MAX_PAGES && rows.length < totalResults) {
    const result = await queryPage(page, now);
    totalResults = result.totalResults;

    for (const listing of result.data) {
      const row = normalizeEvent(listing.event);
      if (row) rows.push(row);
    }

    console.log(`[ra] page ${page}/${Math.min(MAX_PAGES, Math.ceil(totalResults / PAGE_SIZE))}: ${result.data.length} events`);
    page++;
    if (page <= MAX_PAGES && rows.length < totalResults) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return rows;
}
