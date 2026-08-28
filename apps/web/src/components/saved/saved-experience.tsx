'use client';

import { useEffect, useState } from 'react';
import { HeartIcon } from '@phosphor-icons/react/ssr';

import { getEventsByIds, getVenuesByIds } from '@offmap/db';
import type { VenueRow } from '@offmap/db';
import { toOffmapEvent, type OffmapEvent } from '@offmap/shared';

import { getBrowserSupabase } from '@/lib/supabase/client';
import { getBookmarkedIds } from '@/lib/bookmarks';
import { CardRail } from '@/components/ui/card-rail';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { EventCard } from '@/components/home/event-card';
import { PlaceCard } from '@/components/home/place-card';
import styles from './saved-experience.module.css';

type KindFilter = 'all' | 'events' | 'places';

const KIND_ITEMS = [
  { key: 'all', label: 'All' },
  { key: 'events', label: 'Events' },
  { key: 'places', label: 'Places' },
];

export function SavedExperience() {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [events, setEvents] = useState<OffmapEvent[]>([]);
  const [places, setPlaces] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { events: eventIds, venues: venueIds } = getBookmarkedIds();
      const supabase = getBrowserSupabase();
      try {
        const [eventRows, venueRows] = await Promise.all([
          getEventsByIds(supabase, eventIds),
          getVenuesByIds(supabase, venueIds),
        ]);
        if (cancelled) return;
        setEvents(eventRows.map(toOffmapEvent));
        setPlaces(venueRows);
      } catch (err) {
        console.error('failed to load saved items', err);
        if (!cancelled) {
          setEvents([]);
          setPlaces([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Un-favoriting from this page should drop the card immediately rather
  // than waiting for a reload — re-reading localStorage on every toggle
  // would work too, but this avoids a redundant round trip through it.
  function handleEventUnsave(id: number, saved: boolean) {
    if (saved) return;
    setEvents((prev) => prev.filter((event) => event.id !== id));
  }

  function handlePlaceUnsave(id: number, saved: boolean) {
    if (saved) return;
    setPlaces((prev) => prev.filter((venue) => venue.id !== id));
  }

  const showEvents = kindFilter !== 'places' && events.length > 0;
  const showPlaces = kindFilter !== 'events' && places.length > 0;
  const isEmpty = !loading && !showEvents && !showPlaces;

  return (
    <div>
      <div className={styles.filterRow}>
        <SegmentedToggle
          items={KIND_ITEMS}
          activeKey={kindFilter}
          onChange={(key) => setKindFilter(key as KindFilter)}
          size="sm"
          aria-label="Filter by kind"
        />
      </div>

      {loading ? null : isEmpty ? (
        <EmptyState
          icon={<HeartIcon weight="duotone" size={32} />}
          title="Nothing saved yet"
          subtitle="Tap the heart on an event or place to save it here."
        />
      ) : (
        <>
          {showEvents ? (
            <CardRail title="Saved Events" layout="grid">
              {events.map((event) => (
                <EventCard key={event.id} event={event} onFavoriteChange={(saved) => handleEventUnsave(event.id, saved)} />
              ))}
            </CardRail>
          ) : null}
          {showPlaces ? (
            <CardRail title="Saved Places" layout="grid">
              {places.map((venue) => (
                <PlaceCard key={venue.id} venue={venue} onFavoriteChange={(saved) => handlePlaceUnsave(venue.id, saved)} />
              ))}
            </CardRail>
          ) : null}
        </>
      )}
    </div>
  );
}
