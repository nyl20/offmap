import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { EventCategory, OffmapEvent } from '@/types/event';

const homeEventLimit = 48;
const preferredSources = ['Resident Advisor', 'Partiful'];

type SupabaseEventRow = {
  id: number;
  title: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  price_text: string | null;
  is_free: boolean | null;
  ticket_url: string | null;
  organizer_name: string | null;
  image_url: string | null;
  can_display: boolean | null;
  source_url: string | null;
  source_name: string | null;
  source_fetched_at: string | null;
  source_updated_at: string | null;
  review_status: string | null;
  categories: string[] | null;
  sub_categories: string[] | null;
};

export async function fetchHomeEvents() {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('events')
    .select(
      [
        'id',
        'title',
        'description',
        'category',
        'tags',
        'start_time',
        'end_time',
        'timezone',
        'price_text',
        'is_free',
        'ticket_url',
        'organizer_name',
        'image_url',
        'can_display',
        'source_url',
        'source_name',
        'source_fetched_at',
        'source_updated_at',
        'review_status',
        'categories',
        'sub_categories',
      ].join(','),
    )
    .eq('review_status', 'approved')
    .eq('can_display', true)
    .not('image_url', 'is', null)
    .in('source_name', preferredSources)
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(homeEventLimit);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as SupabaseEventRow[];

  return rows.map(mapSupabaseEvent);
}

export async function fetchEventById(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const numericId = Number(id);

  if (!Number.isInteger(numericId)) {
    return null;
  }

  const { data, error } = await supabase
    .from('events')
    .select(
      [
        'id',
        'title',
        'description',
        'category',
        'tags',
        'start_time',
        'end_time',
        'timezone',
        'price_text',
        'is_free',
        'ticket_url',
        'organizer_name',
        'image_url',
        'can_display',
        'source_url',
        'source_name',
        'source_fetched_at',
        'source_updated_at',
        'review_status',
        'categories',
        'sub_categories',
      ].join(','),
    )
    .eq('id', numericId)
    .eq('review_status', 'approved')
    .eq('can_display', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSupabaseEvent(data as unknown as SupabaseEventRow) : null;
}

function mapSupabaseEvent(row: SupabaseEventRow): OffmapEvent {
  const categoryLabels = normalizeLabels(row.categories, row.category);
  const sourceUrl = row.ticket_url ?? row.source_url ?? undefined;
  const startTime = row.start_time ?? row.source_updated_at ?? row.source_fetched_at ?? new Date().toISOString();
  const endTime = row.end_time ?? row.start_time ?? startTime;

  return {
    id: String(row.id),
    title: row.title?.trim() || 'Untitled event',
    description: row.description?.trim() || 'Details are still being gathered for this event.',
    category: toEventCategory(categoryLabels[0] ?? row.category),
    startTime,
    endTime,
    venueName: row.organizer_name?.trim() || row.source_name?.trim() || 'Venue TBA',
    address: 'Location details pending',
    latitude: 0,
    longitude: 0,
    imageUrl: row.image_url?.trim() || undefined,
    sourceUrl,
    sourceName: row.source_name?.trim() || undefined,
    price: row.is_free ? 'Free' : row.price_text?.trim() || 'Details soon',
    tags: normalizeLabels(row.tags, row.sub_categories?.[0]).slice(0, 6),
    categoryLabels,
    createdAt: row.source_fetched_at ?? row.source_updated_at ?? startTime,
  };
}

function normalizeLabels(values?: string[] | null, fallback?: string | null) {
  const labels = [...(values ?? []), fallback]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());

  return Array.from(new Set(labels));
}

function toEventCategory(value?: string | null): EventCategory {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized?.includes('music') ||
    normalized?.includes('nightlife') ||
    normalized?.includes('house') ||
    normalized?.includes('techno') ||
    normalized?.includes('ambient') ||
    normalized?.includes('dance') ||
    normalized?.includes('dj')
  ) {
    return 'music';
  }
  if (normalized?.includes('food') || normalized?.includes('drink')) {
    return 'food';
  }
  if (normalized?.includes('craft') || normalized?.includes('art')) {
    return 'art';
  }
  if (normalized?.includes('market')) {
    return 'market';
  }
  if (normalized?.includes('museum')) {
    return 'museum';
  }
  if (normalized?.includes('popup') || normalized?.includes('pop-up')) {
    return 'popup';
  }

  return 'other';
}
