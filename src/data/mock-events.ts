import type { OffmapEvent } from '@/types/event';

export const mockEvents: OffmapEvent[] = [
  {
    id: 'seed-gallery-night',
    title: 'Gallery Night: New Works',
    description: 'A curated starter event used until Supabase ingestion is wired.',
    category: 'art',
    startTime: '2026-06-12T22:00:00.000Z',
    endTime: '2026-06-13T01:00:00.000Z',
    venueName: 'Downtown Arts Space',
    address: '123 Main St',
    latitude: 40.7128,
    longitude: -74.006,
    price: 'Free',
    tags: ['gallery', 'tonight', 'free'],
    createdAt: '2026-06-08T00:00:00.000Z',
  },
];
