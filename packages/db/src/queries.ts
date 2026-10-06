import type { SupabaseClient } from '@supabase/supabase-js';

import type { EventRow, EventWithVenueRow, ProfileRow, VenueRow } from './types';

// Every function here takes a SupabaseClient instance rather than
// constructing one itself, so client lifecycle/env-var concerns stay in each
// consuming app (apps/web today, apps/mobile potentially later) while the
// query logic is shared. RLS already scopes reads correctly (venues and
// events are both restricted to can_display=true) — see
// supabase/migrations/20260621000000_init_schema.sql and
// 20260801000000_add_venue_can_display.sql — so no extra filtering is
// needed here beyond what each query is actually asking for.

const EVENT_WITH_VENUE_SELECT = `
  id, venue_id, title, description, categories, sub_categories, start_time, end_time,
  price_text, is_free, image_url, source_url, ticket_url, organizer_name, is_featured,
  venues (
    id, name, address, address_line, city, region, neighborhood,
    website_url, venue_opening_hours, latitude, longitude
  )
`;

export type GetUpcomingEventsOptions = {
  category?: string;
  search?: string;
  limit?: number;
};

export async function getUpcomingEvents(
  supabase: SupabaseClient,
  { category, search, limit = 24 }: GetUpcomingEventsOptions = {}
): Promise<EventWithVenueRow[]> {
  let query = supabase
    .from('events')
    .select(EVENT_WITH_VENUE_SELECT)
    .gte('start_time', new Date().toISOString())
    .order('is_featured', { ascending: false })
    .order('start_time', { ascending: true })
    .limit(limit);

  if (category) {
    query = query.contains('categories', [category]);
  }
  if (search && search.trim()) {
    query = query.textSearch('search_vector', search.trim(), {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data, error } = await query;
  if (error) throw new Error(`getUpcomingEvents failed: ${error.message}`);
  return (data ?? []) as unknown as EventWithVenueRow[];
}

export async function getEventsByIds(
  supabase: SupabaseClient,
  ids: number[]
): Promise<EventWithVenueRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('events').select(EVENT_WITH_VENUE_SELECT).in('id', ids);
  if (error) throw new Error(`getEventsByIds failed: ${error.message}`);
  return (data ?? []) as unknown as EventWithVenueRow[];
}

export async function getEventsByVenueIds(
  supabase: SupabaseClient,
  venueIds: number[]
): Promise<EventWithVenueRow[]> {
  if (venueIds.length === 0) return [];
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_WITH_VENUE_SELECT)
    .in('venue_id', venueIds)
    .gte('start_time', new Date().toISOString())
    .order('is_featured', { ascending: false })
    .order('start_time', { ascending: true });
  if (error) throw new Error(`getEventsByVenueIds failed: ${error.message}`);
  return (data ?? []) as unknown as EventWithVenueRow[];
}

export async function getEventById(
  supabase: SupabaseClient,
  id: number | string
): Promise<EventWithVenueRow | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_WITH_VENUE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getEventById failed: ${error.message}`);
  return (data ?? null) as unknown as EventWithVenueRow | null;
}

const VENUE_SELECT = `
  id, name, address, address_line, city, region, neighborhood,
  categories, sub_categories, is_permanent, website_url,
  venue_opening_hours, description, phone, image_url, latitude, longitude, is_featured
`;

export type GetVenuesOptions = {
  onlyGeocoded?: boolean;
  category?: string;
  search?: string;
  /** Caps to a single page instead of exhaustively paginating — for preview
   * rails/drilldowns that only need a bounded list, not "every venue". */
  limit?: number;
};

// PostgREST caps a single response at 1000 rows by default — the venues
// table already has more than that, so an unbounded call (no `limit`, e.g.
// Discover's "every venue for the map") paginates via .range() rather than
// silently truncating (bit the Discover map once already).
const PAGE_SIZE = 1000;

function applyVenueFilters(
  supabase: SupabaseClient,
  { onlyGeocoded, category, search }: Pick<GetVenuesOptions, 'onlyGeocoded' | 'category' | 'search'>
) {
  // is_featured puts manually-pinned venues first within a category; .order('id')
  // after it is required for correctness, not just presentation — without an
  // explicit stable final sort, PostgREST doesn't guarantee row order is
  // consistent across separate .range() calls, so getVenues's pagination
  // below can silently skip/repeat rows once the table exceeds PAGE_SIZE
  // (the venues table already does). Applies even to the .limit() path so
  // both call shapes return the same first page.
  let query = supabase
    .from('venues')
    .select(VENUE_SELECT)
    // Only permanent, standing places belong in the main places list/map —
    // a venue that exists only because a one-off event was held there
    // shows up via that event's own location instead (see getUpcomingEvents/
    // getEventById's embedded venue), never as a standalone place here.
    .eq('is_permanent', true)
    .order('is_featured', { ascending: false })
    .order('id', { ascending: true });
  if (onlyGeocoded) {
    query = query.not('latitude', 'is', null).not('longitude', 'is', null);
  }
  if (category) {
    query = query.contains('categories', [category]);
  }
  // venues has no search_vector column (unlike events) — a plain ILIKE on
  // name is enough for the "search places by name" case this serves.
  if (search && search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }
  return query;
}

export async function getVenues(
  supabase: SupabaseClient,
  { onlyGeocoded = true, category, search, limit }: GetVenuesOptions = {}
): Promise<VenueRow[]> {
  if (limit != null) {
    const { data, error } = await applyVenueFilters(supabase, { onlyGeocoded, category, search }).limit(limit);
    if (error) throw new Error(`getVenues failed: ${error.message}`);
    return (data ?? []) as unknown as VenueRow[];
  }

  const rows: VenueRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await applyVenueFilters(supabase, { onlyGeocoded, category, search }).range(
      from,
      from + PAGE_SIZE - 1
    );
    if (error) throw new Error(`getVenues failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as VenueRow[]));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function getVenuesByIds(supabase: SupabaseClient, ids: number[]): Promise<VenueRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('venues').select(VENUE_SELECT).in('id', ids);
  if (error) throw new Error(`getVenuesByIds failed: ${error.message}`);
  return (data ?? []) as unknown as VenueRow[];
}

export async function getVenueById(
  supabase: SupabaseClient,
  id: number | string
): Promise<VenueRow | null> {
  const { data, error } = await supabase
    .from('venues')
    .select(VENUE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getVenueById failed: ${error.message}`);
  return (data ?? null) as unknown as VenueRow | null;
}

export type GetNearbyEventsOptions = {
  lat: number;
  lng: number;
  radiusMeters: number;
  startsAfter?: string;
};

// Calls the existing nearby_events(lat, lng, radius_meters, starts_after) SQL
// RPC (supabase/migrations/20260621000000_init_schema.sql) rather than
// hand-rolling a bounding-box query — it's already public-callable and
// internally filters can_display. Returns bare event rows (setof events, no
// venue join); callers with an already-loaded venues list (e.g. Discover,
// which fetches getVenues() once) should look up venue_id against that list
// instead of issuing a second query.
export async function getNearbyEvents(
  supabase: SupabaseClient,
  { lat, lng, radiusMeters, startsAfter }: GetNearbyEventsOptions
): Promise<EventRow[]> {
  const { data, error } = await supabase.rpc('nearby_events', {
    lat,
    lng,
    radius_meters: radiusMeters,
    ...(startsAfter ? { starts_after: startsAfter } : {}),
  });
  if (error) throw new Error(`getNearbyEvents failed: ${error.message}`);
  return (data ?? []) as EventRow[];
}

// =========================================================== profiles ====
// Unlike venues/events, these are user-scoped — RLS restricts reads to
// "public read access to profiles" and writes to auth.uid() = id (see
// supabase/migrations/20260621000000_init_schema.sql), so callers must pass
// a SupabaseClient carrying the signed-in user's session, not the anon
// client used for public venue/event reads.

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(`getProfile failed: ${error.message}`);
  return (data ?? null) as ProfileRow | null;
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Pick<ProfileRow, 'display_name' | 'avatar_url'>>
): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().single();
  if (error) throw new Error(`updateProfile failed: ${error.message}`);
  return data as ProfileRow;
}

// ====================================================== saved_events ====
// Postgres unique-violation (23505) on the (user_id, event_id) primary key
// means "already saved" — a race between two taps of the same save button
// rather than a real failure, so it's swallowed instead of thrown.

export async function getSavedEventIds(supabase: SupabaseClient, userId: string): Promise<number[]> {
  const { data, error } = await supabase.from('saved_events').select('event_id').eq('user_id', userId);
  if (error) throw new Error(`getSavedEventIds failed: ${error.message}`);
  return (data ?? []).map((row) => (row as { event_id: number }).event_id);
}

export async function getSavedEvents(supabase: SupabaseClient, userId: string): Promise<EventWithVenueRow[]> {
  const ids = await getSavedEventIds(supabase, userId);
  return getEventsByIds(supabase, ids);
}

export async function isEventSaved(supabase: SupabaseClient, userId: string, eventId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_events')
    .select('event_id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(`isEventSaved failed: ${error.message}`);
  return data != null;
}

export async function saveEvent(supabase: SupabaseClient, userId: string, eventId: number): Promise<void> {
  const { error } = await supabase.from('saved_events').insert({ user_id: userId, event_id: eventId });
  if (error && error.code !== '23505') throw new Error(`saveEvent failed: ${error.message}`);
}

export async function unsaveEvent(supabase: SupabaseClient, userId: string, eventId: number): Promise<void> {
  const { error } = await supabase.from('saved_events').delete().eq('user_id', userId).eq('event_id', eventId);
  if (error) throw new Error(`unsaveEvent failed: ${error.message}`);
}

// ====================================================== saved_venues ====

export async function getSavedVenueIds(supabase: SupabaseClient, userId: string): Promise<number[]> {
  const { data, error } = await supabase.from('saved_venues').select('venue_id').eq('user_id', userId);
  if (error) throw new Error(`getSavedVenueIds failed: ${error.message}`);
  return (data ?? []).map((row) => (row as { venue_id: number }).venue_id);
}

export async function getSavedVenues(supabase: SupabaseClient, userId: string): Promise<VenueRow[]> {
  const ids = await getSavedVenueIds(supabase, userId);
  return getVenuesByIds(supabase, ids);
}

export async function saveVenue(supabase: SupabaseClient, userId: string, venueId: number): Promise<void> {
  const { error } = await supabase.from('saved_venues').insert({ user_id: userId, venue_id: venueId });
  if (error && error.code !== '23505') throw new Error(`saveVenue failed: ${error.message}`);
}

export async function unsaveVenue(supabase: SupabaseClient, userId: string, venueId: number): Promise<void> {
  const { error } = await supabase.from('saved_venues').delete().eq('user_id', userId).eq('venue_id', venueId);
  if (error) throw new Error(`unsaveVenue failed: ${error.message}`);
}
