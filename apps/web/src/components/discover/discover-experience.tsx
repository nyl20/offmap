'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPinIcon, MapTrifoldIcon } from '@phosphor-icons/react/ssr';

import type { EventRow, EventWithVenueRow, VenueRow } from '@offmap/db';
import { getEventsByVenueIds, getNearbyEvents, getUpcomingEvents } from '@offmap/db';
import {
  deriveSubcategories,
  formatEventDateTime,
  formatVenueHours,
  getCurrentWeekdayLabel,
  type OffmapCategory,
} from '@offmap/shared';

import { getBrowserSupabase } from '@/lib/supabase/client';
import { haversineMeters } from '@/lib/geo';
import { CategoryIcon } from '@/lib/icons';
import { usePageTransition } from '@/components/layout/page-transition-provider';

import { MapFiltersOverlay, type DiscoverKindFilter } from './map-filters-overlay';
import { MapView } from './map-view';
import { NearbyPanel, type NearbyPanelItem } from './nearby-panel';
import styles from './discover-experience.module.css';

const ROW_ICON_SIZE = 18;

function rowIcon(categoryId: string | undefined) {
  return categoryId ? (
    <CategoryIcon category={categoryId} size={ROW_ICON_SIZE} weight="regular" />
  ) : (
    <MapPinIcon weight="regular" size={ROW_ICON_SIZE} />
  );
}

// A plain `text.includes(wholePhrase)` search misses reasonable queries like
// "Met Museum" against "The Metropolitan Museum of Art" — every word is
// present, just not as one contiguous substring. Splitting into tokens and
// requiring each to appear somewhere in the combined searchable text (in any
// order) fixes that without needing a real full-text search index here.
function tokenize(term: string): string[] {
  return term.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const lower = haystack.toLowerCase();
  return tokens.every((tok) => lower.includes(tok));
}

function buildPlaceItem(venue: VenueRow): NearbyPanelItem {
  const hours = formatVenueHours(venue.venue_opening_hours);
  return {
    id: `venue:${venue.id}`,
    href: `/venue/${venue.id}`,
    icon: rowIcon(venue.categories[0]),
    imageUrl: venue.image_url,
    title: venue.name,
    subtitle: `${venue.neighborhood ?? venue.address} · ${getCurrentWeekdayLabel()} · ${hours ?? 'Hours not listed'}`,
  };
}

function buildEventItem(event: EventRow, venuesById: Map<number, VenueRow>): NearbyPanelItem {
  const venue = venuesById.get(event.venue_id);
  return {
    id: `event:${event.id}`,
    href: `/event/${event.id}`,
    icon: rowIcon(event.categories[0]),
    imageUrl: event.image_url,
    title: event.title,
    subtitle: `${venue?.neighborhood ?? venue?.address ?? 'TBA'} · ${formatEventDateTime(event.start_time, event.end_time)}`,
  };
}

const RADIUS_METERS = 1500;
const MOVE_DEBOUNCE_MS = 400;
const NEARBY_PLACES_LIMIT = 30;
// Generous rather than tight — big enough that a specific, actively-searched
// event essentially never gets left out, while still bounding query cost
// (unlike venues, events aren't fetched fully unbounded up front).
const SEARCH_EVENTS_FETCH_LIMIT = 500;

type PanelMode = 'nearby' | 'cluster' | 'viewport';

export function DiscoverExperience({ venues }: { venues: VenueRow[] }) {
  const router = useRouter();
  const { startExpand } = usePageTransition();
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<DiscoverKindFilter>('all');
  const [activeCategory, setActiveCategory] = useState<OffmapCategory | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyEvents, setNearbyEvents] = useState<EventRow[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cluster-click / zoomed-in-viewport panel state — see map-view.tsx's
  // onClusterClick/onViewportVenuesChange for how these get populated.
  const [panelMode, setPanelMode] = useState<PanelMode>('nearby');
  const [focusVenueIds, setFocusVenueIds] = useState<number[] | null>(null);
  const [focusEvents, setFocusEvents] = useState<EventWithVenueRow[]>([]);
  const [loadingFocusEvents, setLoadingFocusEvents] = useState(false);
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const venuesById = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);

  function handleCategoryChange(category: OffmapCategory | null) {
    setActiveCategory(category);
    setActiveSubcategory(null);
  }

  function handleSearchChange(term: string) {
    setSearchTerm(term);
    // Typing a search while a category is selected would otherwise scope
    // results to that category, silently hiding matches outside it — search
    // should look everywhere, so starting one drops the category filter.
    if (term.trim() && (activeCategory || activeSubcategory)) {
      setActiveCategory(null);
      setActiveSubcategory(null);
    }
  }

  // Subcategories are derived from venues only (not nearbyEvents, which is
  // just a viewport-scoped slice) — good enough for a pill row, and avoids
  // an extra full-events fetch just to populate it.
  const subcategoriesForCategory = useMemo(() => {
    if (!activeCategory) return [];
    return deriveSubcategories(
      venues.filter((v) => v.categories.includes(activeCategory)).map((v) => v.sub_categories)
    );
  }, [venues, activeCategory]);

  const baseFilteredVenues = useMemo(() => {
    const tokens = tokenize(searchTerm);
    return venues.filter((venue) => {
      if (activeCategory && !venue.categories.includes(activeCategory)) return false;
      if (activeSubcategory && !venue.sub_categories.includes(activeSubcategory)) return false;
      if (!matchesTokens(`${venue.name} ${venue.neighborhood ?? ''}`, tokens)) return false;
      return true;
    });
  }, [venues, activeCategory, activeSubcategory, searchTerm]);

  // "Events" mode narrows pins to venues currently hosting something nearby
  // — events don't have their own coordinates, a venue's location stands in
  // for its events, so this is the map-native reading of "just events".
  const eventVenueIds = useMemo(() => new Set(nearbyEvents.map((e) => e.venue_id)), [nearbyEvents]);
  const visibleVenues = useMemo(
    () => (kindFilter === 'events' ? baseFilteredVenues.filter((v) => eventVenueIds.has(v.id)) : baseFilteredVenues),
    [kindFilter, baseFilteredVenues, eventVenueIds]
  );

  function handleMoveEnd(center: { lat: number; lng: number }) {
    setMapCenter(center);
  }

  // Drives the default "nearby" panel's event pool. Browsing (no search
  // term) stays radius-bound around the map center, same as before — but an
  // active search bypasses the radius entirely (same reasoning as
  // nearbyPlaces() below: distance-from-center isn't a relevant ranking
  // signal once the user is looking for something specific by name, so
  // capping to "nearest N" could silently exclude the very event being
  // searched for). Matching still happens client-side via matchesEvent
  // further down, not Postgres full-text search, so places and events use
  // identical "does this text contain these words" semantics.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingNearby(true);
      try {
        const supabase = getBrowserSupabase();
        const term = searchTerm.trim();
        let events: EventRow[];
        if (term) {
          events = await getUpcomingEvents(supabase, {
            category: activeCategory ?? undefined,
            limit: SEARCH_EVENTS_FETCH_LIMIT,
          });
        } else if (mapCenter) {
          events = await getNearbyEvents(supabase, {
            lat: mapCenter.lat,
            lng: mapCenter.lng,
            radiusMeters: RADIUS_METERS,
          });
        } else {
          events = [];
        }
        setNearbyEvents(events);
      } catch (err) {
        console.error('events fetch failed', err);
        setNearbyEvents([]);
      } finally {
        setLoadingNearby(false);
      }
    }, MOVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, mapCenter, activeCategory]);

  async function fetchFocusEvents(ids: number[]) {
    setLoadingFocusEvents(true);
    try {
      const supabase = getBrowserSupabase();
      const events = await getEventsByVenueIds(supabase, ids);
      setFocusEvents(events);
    } catch (err) {
      console.error('getEventsByVenueIds failed', err);
      setFocusEvents([]);
    } finally {
      setLoadingFocusEvents(false);
    }
  }

  function handleClusterClick(ids: number[]) {
    setPanelMode('cluster');
    setFocusVenueIds(ids);
    if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    fetchFocusEvents(ids);
  }

  function handleViewportVenuesChange(ids: number[] | null) {
    if (ids === null) {
      // Clusters are back on screen — the auto viewport-listing no longer
      // applies. A deliberate 'cluster' selection stays sticky until
      // replaced or manually cleared, so only 'viewport' reverts here.
      // Functional form is required, not `if (panelMode === 'viewport')`:
      // this callback is captured once by map-view.tsx's mount effect
      // (empty dep array, so the map isn't torn down on every parent
      // re-render), so a closure over `panelMode` would always see its
      // value from that first render rather than the current one.
      setPanelMode((prev) => (prev === 'viewport' ? 'nearby' : prev));
      return;
    }
    setPanelMode('viewport');
    setFocusVenueIds(ids);
    if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    viewportDebounceRef.current = setTimeout(() => fetchFocusEvents(ids), MOVE_DEBOUNCE_MS);
  }

  function handleClearFocus() {
    setPanelMode('nearby');
    setFocusVenueIds(null);
    setFocusEvents([]);
  }

  function handlePointClick(venue: VenueRow, originRect: DOMRect) {
    router.prefetch(`/venue/${venue.id}`);
    // startExpand lives in PageTransitionProvider (mounted in the root
    // layout, above this page) rather than local state here — this
    // component and everything in it gets unmounted the instant router.push
    // below actually swaps the route, which would otherwise kill the
    // overlay's animation mid-flight regardless of its own timers.
    startExpand(venue, originRect);
    router.push(`/venue/${venue.id}`);
  }

  const panelItems: NearbyPanelItem[] = useMemo(() => {
    const tokens = tokenize(searchTerm);

    function matchesEvent(event: EventRow) {
      if (activeCategory && !event.categories.includes(activeCategory)) return false;
      if (activeSubcategory && !event.sub_categories.includes(activeSubcategory)) return false;
      const venueName = venuesById.get(event.venue_id)?.name ?? '';
      return matchesTokens(`${event.title} ${venueName}`, tokens);
    }

    // "All" mixes both places and events together — used to only fall
    // through to events-only here (places never showed at all outside the
    // dedicated "Places" filter, which is why searching for a place like a
    // museum while on "All" came up empty). Kept consistent with the
    // cluster/viewport branch below, which already mixes both.
    function nearbyPlaces(): NearbyPanelItem[] {
      if (tokens.length > 0) {
        // Actively searching for something specific — nearest-to-map-center
        // ranking doesn't apply here (that's for passive "what's around me"
        // browsing). Capping to the 30 closest matches could silently drop
        // the very place being searched for if the map is centered
        // somewhere else and 30+ *other* matches happen to be closer.
        return baseFilteredVenues.map(buildPlaceItem);
      }
      const withDistance = baseFilteredVenues.map((v) => ({
        venue: v,
        distance:
          mapCenter && v.latitude != null && v.longitude != null
            ? haversineMeters(mapCenter, { lat: v.latitude, lng: v.longitude })
            : Infinity,
      }));
      withDistance.sort((a, b) => a.distance - b.distance);
      return withDistance.slice(0, NEARBY_PLACES_LIMIT).map(({ venue }) => buildPlaceItem(venue));
    }

    if (panelMode === 'cluster' || panelMode === 'viewport') {
      const focusIdSet = new Set(focusVenueIds ?? []);
      const places =
        kindFilter !== 'events'
          ? baseFilteredVenues.filter((v) => focusIdSet.has(v.id)).map(buildPlaceItem)
          : [];
      const events =
        kindFilter !== 'places' ? focusEvents.filter(matchesEvent).map((e) => buildEventItem(e, venuesById)) : [];
      return [...places, ...events];
    }

    const places = kindFilter !== 'events' ? nearbyPlaces() : [];
    const events = kindFilter !== 'places' ? nearbyEvents.filter(matchesEvent).map((e) => buildEventItem(e, venuesById)) : [];
    return [...places, ...events];
  }, [
    panelMode,
    focusVenueIds,
    focusEvents,
    baseFilteredVenues,
    mapCenter,
    nearbyEvents,
    activeCategory,
    activeSubcategory,
    searchTerm,
    venuesById,
    kindFilter,
  ]);

  const panelLabel =
    panelMode === 'cluster'
      ? 'In this cluster'
      : panelMode === 'viewport'
        ? 'Visible on map'
        : kindFilter === 'places'
          ? 'Nearby places'
          : kindFilter === 'events'
            ? 'Nearby events'
            : 'Nearby';
  // Places resolve synchronously (client-side filter over the already-loaded
  // venues array) while events are fetched async — gated only on the async
  // flag, "Loading…" would keep hiding perfectly-ready place results for as
  // long as the events fetch takes. Only show it when there's genuinely
  // nothing to show yet; once anything is visible, new results (events
  // included) just appear in place rather than flashing a loading state.
  const panelLoading =
    panelItems.length === 0 && (panelMode === 'nearby' ? kindFilter !== 'places' && loadingNearby : loadingFocusEvents);

  return (
    <div className={styles.wrap}>
      <MapView
        venues={visibleVenues}
        onMoveEnd={handleMoveEnd}
        onClusterClick={handleClusterClick}
        onViewportVenuesChange={handleViewportVenuesChange}
        onPointClick={handlePointClick}
      />
      <MapFiltersOverlay
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        kindFilter={kindFilter}
        onKindChange={setKindFilter}
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        subcategories={subcategoriesForCategory}
        activeSubcategory={activeSubcategory}
        onSubcategoryChange={setActiveSubcategory}
      />
      <NearbyPanel
        icon={kindFilter === 'places' ? <MapPinIcon weight="regular" size={16} /> : <MapTrifoldIcon weight="regular" size={16} />}
        label={panelLabel}
        items={panelItems}
        loading={panelLoading}
        emptyTitle={kindFilter === 'places' ? 'No places match here' : kindFilter === 'events' ? 'No upcoming events here' : 'Nothing matches here'}
        emptySubtitle={kindFilter === 'places' ? 'Try a different filter or search.' : 'Pan or zoom the map to look somewhere else.'}
        onClear={panelMode !== 'nearby' ? handleClearFocus : undefined}
      />
    </div>
  );
}
