'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/ssr';

import { getUpcomingEvents, getVenues } from '@offmap/db';
import type { VenueRow } from '@offmap/db';
import { getCategoryMeta, toOffmapEvent, type CategoryMeta, type OffmapCategory, type OffmapEvent } from '@offmap/shared';

import { getBrowserSupabase } from '@/lib/supabase/client';
import { CardRail } from '@/components/ui/card-rail';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';

import { CategoryChips } from './category-chips';
import { CategoryDrilldown } from './category-drilldown';
import { EventCard } from './event-card';
import { PlaceCard } from './place-card';
import { SearchBar } from './search-bar';
import styles from './home-experience.module.css';

type Section = { category: CategoryMeta; events: OffmapEvent[]; places: VenueRow[] };
type KindFilter = 'all' | 'events' | 'places';

const KIND_ITEMS = [
  { key: 'all', label: 'All' },
  { key: 'events', label: 'Events' },
  { key: 'places', label: 'Places' },
];

const DRILLDOWN_LIMIT = 60;
const SEARCH_LIMIT = 24;

export function HomeExperience({ sections }: { sections: Section[] }) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ events: OffmapEvent[]; places: VenueRow[] } | null>(null);
  const [searching, setSearching] = useState(false);

  const [drilldownCategory, setDrilldownCategory] = useState<OffmapCategory | null>(null);
  const [drilldownData, setDrilldownData] = useState<{ events: OffmapEvent[]; places: VenueRow[] }>({
    events: [],
    places: [],
  });
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  async function handleSearch(term: string) {
    setSearchTerm(term);
    if (!term.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const supabase = getBrowserSupabase();
      const [eventRows, places] = await Promise.all([
        getUpcomingEvents(supabase, { search: term, limit: SEARCH_LIMIT }),
        getVenues(supabase, { search: term, onlyGeocoded: false, limit: SEARCH_LIMIT }),
      ]);
      setSearchResults({ events: eventRows.map(toOffmapEvent), places });
    } catch (err) {
      console.error('search failed', err);
      setSearchResults({ events: [], places: [] });
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectCategory(id: OffmapCategory | null) {
    setDrilldownCategory(id);
    if (id === null) return;
    setDrilldownLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const [eventRows, places] = await Promise.all([
        getUpcomingEvents(supabase, { category: id, limit: DRILLDOWN_LIMIT }),
        getVenues(supabase, { category: id, onlyGeocoded: false, limit: DRILLDOWN_LIMIT }),
      ]);
      setDrilldownData({ events: eventRows.map(toOffmapEvent), places });
    } catch (err) {
      console.error('category fetch failed', err);
      setDrilldownData({ events: [], places: [] });
    } finally {
      setDrilldownLoading(false);
    }
  }

  const isSearchMode = searchTerm.trim().length > 0;
  const drilldownMeta = drilldownCategory ? getCategoryMeta(drilldownCategory) : null;

  return (
    <div>
      <div className={styles.searchRow}>
        <SearchBar onSearch={handleSearch} />
        <SegmentedToggle
          items={KIND_ITEMS}
          activeKey={kindFilter}
          onChange={(key) => setKindFilter(key as KindFilter)}
          size="sm"
          aria-label="Filter by kind"
        />
      </div>

      {isSearchMode ? (
        searching && !searchResults ? (
          <EmptyState icon={<MagnifyingGlassIcon weight="duotone" size={32} />} title="Searching…" />
        ) : (
          <SearchResults results={searchResults} term={searchTerm} kindFilter={kindFilter} />
        )
      ) : drilldownMeta ? (
        <CategoryDrilldown
          category={drilldownMeta}
          events={drilldownData.events}
          places={drilldownData.places}
          loading={drilldownLoading}
          kindFilter={kindFilter}
          onBack={() => handleSelectCategory(null)}
        />
      ) : (
        <>
          <CategoryChips categories={sections.map((s) => s.category)} activeId={null} onSelect={handleSelectCategory} />
          {sections.map((section) => {
            const showEvents = kindFilter !== 'places' && section.events.length > 0;
            const showPlaces = kindFilter !== 'events' && section.places.length > 0;
            if (!showEvents && !showPlaces) return null;
            return (
              <div key={section.category.id}>
                {showEvents ? (
                  <CardRail title={section.category.label}>
                    {section.events.map((event) => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </CardRail>
                ) : null}
                {showPlaces ? (
                  <CardRail title={`${section.category.label} Spots`}>
                    {section.places.map((venue) => (
                      <PlaceCard key={venue.id} venue={venue} />
                    ))}
                  </CardRail>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function SearchResults({
  results,
  term,
  kindFilter,
}: {
  results: { events: OffmapEvent[]; places: VenueRow[] } | null;
  term: string;
  kindFilter: KindFilter;
}) {
  const events = kindFilter !== 'places' ? (results?.events ?? []) : [];
  const places = kindFilter !== 'events' ? (results?.places ?? []) : [];

  if (events.length === 0 && places.length === 0) {
    return (
      <EmptyState icon={<MagnifyingGlassIcon weight="duotone" size={32} />} title={`No matches for "${term}"`} subtitle="Try a different word, or browse by category below." />
    );
  }

  return (
    <>
      {events.length > 0 ? (
        <CardRail title={`Events for "${term}"`}>
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </CardRail>
      ) : null}
      {places.length > 0 ? (
        <CardRail title={`Places for "${term}"`}>
          {places.map((venue) => (
            <PlaceCard key={venue.id} venue={venue} />
          ))}
        </CardRail>
      ) : null}
    </>
  );
}
