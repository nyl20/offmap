import { normalizeText, buildSearchText, splitUSAddress, normalizeTags } from '../scrapers/utils.js';
import { classify } from '../scrapers/classify.js';

// NYC bounding box — pre-geocoded venue coords (from scrapers that supply
// their own lat/lng) are validated against this before being trusted.
export const NYC = { minLng: -74.26, maxLng: -73.70, minLat: 40.49, maxLat: 40.92 };

function inNYC(lat, lng) {
  return lat >= NYC.minLat && lat <= NYC.maxLat
      && lng >= NYC.minLng && lng <= NYC.maxLng;
}

function parseBool(val) {
  return ['true', '1', 'yes', 'free'].includes(String(val ?? '').toLowerCase().trim());
}

// upsertVenue and insertEvent classify the same row independently by
// default — callers that invoke both for one row (runner.js, csv-intake.js)
// should compute this once and pass it to both to avoid running the
// classify() regex scan twice per row.
export function classifyRow(row) {
  return classify({
    title: row.title,
    description: row.description,
    category: row.category,
    tags: normalizeTags(row.tags),
    venue_name: row.venue_name,
    subCategoryHint: row.sub_category_hint,
  });
}

// Upserts a venue via the `upsert_venue` RPC (see offmap/supabase/migrations),
// which does the PostGIS point construction and COALESCE-based progressive
// enrichment (never overwrite an already-set value) in one round trip.
export async function upsertVenue(db, row, classification) {
  const { venue_name: name, venue_address: address, venue_lat: lat, venue_lng: lng, source_name } = row;

  // Use scraper-supplied address parts when given, otherwise best-effort split
  const split = splitUSAddress(address);
  const addressLine = row.venue_address_line ?? split.line;
  const city         = row.venue_city         ?? split.city;
  const region       = row.venue_region       ?? split.region;
  const postal       = row.venue_postal       ?? split.postal;
  const country      = row.venue_country      ?? split.country ?? 'US';
  const normalizedName = normalizeText(name);
  const openingHours   = row.venue_opening_hours ?? null;

  // Classified from whatever's on the row — venue-only scrapers (museums.js)
  // only supply venue_name, while event-sourced rows also carry
  // title/description/category/tags, giving a much richer signal. Either
  // way this is the only place venue categorization happens — see
  // classify.js. Progressive: upsert_venue unions these into any categories
  // already stored, so a venue's categories grow as more events tag it.
  // Callers that also call insertEvent for this row should pass a
  // precomputed classification (via classifyRow) to avoid classifying twice.
  const { categories, subCategories } = classification ?? classifyRow(row);

  // Write pre-geocoded coords directly — saves Mapbox API calls.
  // Treat scraper-supplied coordinates as fully trusted (confidence 1.0).
  const hasCoords = lat != null && lng != null && inNYC(lat, lng);

  const { data, error } = await db.rpc('upsert_venue', {
    p_name: name,
    p_address: address,
    p_address_line: addressLine,
    p_city: city,
    p_region: region,
    p_postal_code: postal,
    p_country: country,
    p_normalized_venue_name: normalizedName,
    p_venue_opening_hours: openingHours,
    p_categories: categories,
    p_sub_categories: subCategories,
    p_lat: hasCoords ? lat : null,
    p_lng: hasCoords ? lng : null,
    p_geocode_provider: hasCoords ? source_name : null,
    p_geocode_confidence: hasCoords ? 1.0 : null,
  });

  if (error) throw new Error(`upsert_venue failed: ${error.message}`);
  return data;
}

// Inserts an event via the `insert_event` RPC, which does the INSERT ...
// ON CONFLICT (source_url) DO NOTHING and the last_verified_at refresh in one
// round trip. Returns true if a new row was inserted, false if it was a
// duplicate source_url.
export async function insertEvent(db, venueId, row, fetchedAt, classification) {
  const tagList = normalizeTags(row.tags);

  const normalizedTitle = normalizeText(row.title);
  const searchText = buildSearchText(row.title, row.description, row.venue_name, tagList, row.category);
  const { categories, subCategories } = classification ?? classifyRow(row);

  // ticket_url / image_source_url fall back to source_url when the scraper
  // doesn't distinguish a separate link — for most sources the event's own
  // page IS the ticket page / image context.
  const ticketUrl      = row.ticket_url ?? row.source_url;
  const imageSourceUrl = row.image_source_url ?? (row.image_url ? row.source_url : null);

  const { data, error } = await db.rpc('insert_event', {
    p_venue_id:          venueId,
    p_external_id:       row.external_id ?? null,
    p_title:             row.title?.trim(),
    p_normalized_title:  normalizedTitle,
    p_description:       row.description?.trim() ?? null,
    p_category:          row.category ?? null,
    p_tags:              tagList,
    p_categories:        categories,
    p_sub_categories:    subCategories,
    p_search_text:       searchText,
    p_start_time:        row.start_time,
    p_end_time:          row.end_time ?? null,
    p_timezone:          row.timezone ?? 'America/New_York',
    p_recurrence_rule:   row.recurrence_rule ?? null,
    p_price_text:        row.price_text ?? null,
    p_is_free:           parseBool(row.is_free),
    p_age_restriction:   row.age_restriction ?? null,
    p_ticket_url:        ticketUrl,
    p_organizer_name:    row.organizer_name ?? null,
    p_image_url:         row.image_url ?? null,
    p_image_source_url:  imageSourceUrl,
    p_image_credit:      row.image_credit ?? null,
    p_image_license:     row.image_license ?? null,
    p_source_url:        row.source_url,
    p_source_name:       row.source_name,
    p_fetched_at:        fetchedAt,
    p_review_status:     row.review_status ?? 'candidate',
    p_confidence_score:  row.confidence_score ?? null,
    p_notes:             row.notes ?? null,
  });

  if (error) throw new Error(`insert_event failed: ${error.message}`);
  return data;
}

export async function purgePastEvents(db) {
  const { data, error } = await db.rpc('purge_past_events');
  if (error) throw new Error(`purge_past_events failed: ${error.message}`);
  return data;
}

export async function recomputeCanDisplay(db) {
  const { data, error } = await db.rpc('recompute_can_display');
  if (error) throw new Error(`recompute_can_display failed: ${error.message}`);
  return data;
}

export async function recomputeDuplicateGroups(db) {
  const { data, error } = await db.rpc('recompute_duplicate_groups');
  if (error) throw new Error(`recompute_duplicate_groups failed: ${error.message}`);
  return { groupCount: data.group_count, eventCount: data.event_count };
}

export async function recomputeCompletenessScores(db) {
  const { data, error } = await db.rpc('recompute_completeness_scores');
  if (error) throw new Error(`recompute_completeness_scores failed: ${error.message}`);
  return data;
}

export async function recomputeVenueCompletenessScores(db) {
  const { data, error } = await db.rpc('recompute_venue_completeness_scores');
  if (error) throw new Error(`recompute_venue_completeness_scores failed: ${error.message}`);
  return data;
}

export async function mergeDuplicateVenues(db) {
  const { data, error } = await db.rpc('merge_duplicate_venues');
  if (error) throw new Error(`merge_duplicate_venues failed: ${error.message}`);
  return { groupCount: data.group_count, mergedCount: data.merged_count };
}

export async function recomputeVenueCanDisplay(db) {
  const { data, error } = await db.rpc('recompute_venue_can_display');
  if (error) throw new Error(`recompute_venue_can_display failed: ${error.message}`);
  return data;
}

export async function mergeCrossNameDuplicateVenues(db) {
  const { data, error } = await db.rpc('merge_cross_name_duplicate_venues');
  if (error) throw new Error(`merge_cross_name_duplicate_venues failed: ${error.message}`);
  return { mergedCount: data.merged_count };
}

export async function queueLowConfidenceVenueDuplicates(db) {
  const { data, error } = await db.rpc('queue_low_confidence_venue_duplicates');
  if (error) throw new Error(`queue_low_confidence_venue_duplicates failed: ${error.message}`);
  return data;
}
