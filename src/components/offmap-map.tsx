import Mapbox from '@rnmapbox/maps';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { mockEvents } from '@/data/mock-events';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useEventFilterStore } from '@/store/use-event-filter-store';
import type { EventCategory, OffmapEvent } from '@/types/event';

const mapboxAccessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const initialEvent = mockEvents[0];
const initialCenter: [number, number] = [initialEvent.longitude, initialEvent.latitude];
const quickFilters: { label: string; category?: EventCategory; freeOnly?: boolean }[] = [
  { label: 'Today' },
  { label: 'Free', freeOnly: true },
  { label: 'Art', category: 'art' },
  { label: 'Food', category: 'food' },
];

if (mapboxAccessToken) {
  Mapbox.setAccessToken(mapboxAccessToken);
}

export function OffmapMap() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(initialEvent.id);
  const categories = useEventFilterStore((state) => state.categories);
  const setCategories = useEventFilterStore((state) => state.setCategories);
  const freeOnly = useEventFilterStore((state) => state.freeOnly);
  const setFreeOnly = useEventFilterStore((state) => state.setFreeOnly);
  const radiusMiles = useEventFilterStore((state) => state.radiusMiles);

  const filteredEvents = useMemo(() => {
    return filterEvents({ categories, freeOnly, searchQuery });
  }, [categories, freeOnly, searchQuery]);
  const selectedEvent = filteredEvents.find((event) => event.id === selectedEventId) ?? filteredEvents[0];

  if (!mapboxAccessToken) {
    return (
      <SafeAreaView style={styles.emptyState}>
        <ThemedText type="title">Map token missing</ThemedText>
        <ThemedText themeColor="textSecondary">
          Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to your .env file, then reload the app.
        </ThemedText>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        scaleBarEnabled={false}
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera
          animationMode="flyTo"
          animationDuration={800}
          centerCoordinate={initialCenter}
          pitch={30}
          zoomLevel={12}
        />

        {filteredEvents.map((event) => (
          <Mapbox.PointAnnotation
            key={event.id}
            id={event.id}
            coordinate={[event.longitude, event.latitude]}
            onSelected={() => setSelectedEventId(event.id)}>
            <View style={styles.marker}>
              <View style={styles.markerCore} />
            </View>
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search events, venues, neighborhoods"
          placeholderTextColor="#64748B"
          style={styles.searchInput}
        />
        <View style={styles.filterRow}>
          {quickFilters.map((filter) => {
            const active =
              filter.freeOnly === true
                ? freeOnly
                : filter.category
                  ? categories.includes(filter.category)
                  : false;

            return (
              <Pressable
                key={filter.label}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() =>
                  filter.freeOnly === true
                    ? setFreeOnly(!freeOnly)
                    : filter.category
                      ? setCategories(toggleCategory(categories, filter.category))
                      : undefined
                }>
                <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
                  {filter.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottomSheet}>
        <ThemedText type="smallBold">Nearby within {radiusMiles} miles</ThemedText>
        {selectedEvent ? (
          <Link href={`/event/${selectedEvent.id}`} asChild>
            <Pressable style={styles.eventCard}>
              <ThemedText type="smallBold">{selectedEvent.category.toUpperCase()}</ThemedText>
              <ThemedText type="subtitle">{selectedEvent.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedEvent.venueName} - {selectedEvent.price}
              </ThemedText>
            </Pressable>
          </Link>
        ) : (
          <View style={styles.eventCard}>
            <ThemedText type="smallBold">No events match these filters</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Try clearing search or filter chips.
            </ThemedText>
          </View>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          Supabase: {isSupabaseConfigured ? 'configured' : 'add env vars in .env'}
        </ThemedText>
      </SafeAreaView>
    </View>
  );
}

function filterEvents({
  categories,
  freeOnly,
  searchQuery,
}: {
  categories: EventCategory[];
  freeOnly: boolean;
  searchQuery: string;
}) {
  const query = searchQuery.trim().toLowerCase();

  return mockEvents.filter((event) => {
    const matchesCategory = categories.length === 0 || categories.includes(event.category);
    const matchesFree = !freeOnly || event.price?.toLowerCase() === 'free';
    const matchesSearch =
      query.length === 0 ||
      [event.title, event.venueName, event.address, ...event.tags]
        .join(' ')
        .toLowerCase()
        .includes(query);

    return matchesCategory && matchesFree && matchesSearch;
  });
}

function toggleCategory(categories: EventCategory[], category: EventCategory) {
  return categories.includes(category)
    ? categories.filter((selectedCategory) => selectedCategory !== category)
    : [...categories, category];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  map: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: 10,
    paddingHorizontal: 16,
  },
  searchInput: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    color: '#0F172A',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  filterChipActive: {
    backgroundColor: '#E0F2FE',
  },
  marker: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  markerCore: {
    width: 18,
    height: 18,
    borderWidth: 3,
    borderColor: '#ffffff',
    borderRadius: 9,
    backgroundColor: '#208AEF',
  },
  eventCard: {
    gap: 6,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  bottomSheet: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: Colors.light.background,
  },
});
