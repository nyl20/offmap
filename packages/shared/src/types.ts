import type { EventWithVenueRow, VenueRow } from '@offmap/db';

import { primaryCategory } from './categories';

// UI-facing shapes adapted from packages/db row types — trims ops-only
// columns (review_status, confidence_score, duplicate_group_id,
// source_fetched_at, etc.) that the website never needs to render, and
// normalizes venue info onto a flat, always-present shape (falling back to
// "TBA" rather than propagating nulls into every component).

export type OffmapVenue = {
  id: number;
  name: string;
  address: string;
  neighborhood: string | null;
  websiteUrl: string | null;
  openingHours: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type OffmapEvent = {
  id: number;
  title: string;
  description: string | null;
  categories: string[];
  category: ReturnType<typeof primaryCategory>;
  subCategories: string[];
  startTime: string;
  endTime: string | null;
  priceText: string | null;
  isFree: boolean;
  imageUrl: string | null;
  websiteUrl: string;
  venue: OffmapVenue;
};

export function toOffmapVenue(row: VenueRow | EventWithVenueRow['venues']): OffmapVenue {
  return {
    id: row?.id ?? 0,
    name: row?.name ?? 'TBA',
    address: row?.address ?? '',
    neighborhood: row?.neighborhood ?? null,
    websiteUrl: row?.website_url ?? null,
    openingHours: row?.venue_opening_hours ?? null,
    latitude: row?.latitude ?? null,
    longitude: row?.longitude ?? null,
  };
}

export function toOffmapEvent(row: EventWithVenueRow): OffmapEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categories: row.categories,
    category: primaryCategory(row.categories),
    subCategories: row.sub_categories,
    startTime: row.start_time,
    endTime: row.end_time,
    priceText: row.price_text,
    isFree: row.is_free,
    imageUrl: row.image_url,
    websiteUrl: row.ticket_url ?? row.source_url,
    venue: toOffmapVenue(row.venues),
  };
}
