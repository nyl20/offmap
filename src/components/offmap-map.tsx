import Mapbox from '@rnmapbox/maps';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Palette } from '@/constants/theme';
import { mockEvents } from '@/data/mock-events';
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
  const [sheetExpanded, setSheetExpanded] = useState(false);
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

      <SafeAreaView
        edges={['bottom']}
        style={[styles.bottomSheet, sheetExpanded ? styles.bottomSheetExpanded : styles.bottomSheetCollapsed]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSheetExpanded((expanded) => !expanded)}
          style={styles.sheetHandleArea}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <View style={styles.sheetTitleRow}>
              <SymbolView name={{ ios: 'map', web: 'map' }} size={16} tintColor={Palette.teal} />
              <ThemedText style={styles.sheetTitle}>Nearby events</ThemedText>
            </View>
            <SymbolView
              name={{
                ios: sheetExpanded ? 'chevron.down' : 'chevron.up',
                web: sheetExpanded ? 'expand_more' : 'expand_less',
              }}
              size={16}
              tintColor={Palette.vintageBerry}
            />
          </View>
          {!sheetExpanded && selectedEvent ? (
            <ThemedText numberOfLines={1} style={styles.collapsedEventText}>
              {selectedEvent.title} - {selectedEvent.venueName}
            </ThemedText>
          ) : null}
        </Pressable>

        {sheetExpanded ? (
          <>
            <ThemedText style={styles.sheetMeta}>Within {radiusMiles} miles</ThemedText>
            {selectedEvent ? (
              <Link href={`/event/${selectedEvent.id}`} asChild>
                <Pressable style={styles.eventCard}>
                  <ThemedText style={styles.eventCategory}>{selectedEvent.category}</ThemedText>
                  <ThemedText style={styles.eventTitle}>{selectedEvent.title}</ThemedText>
                  <ThemedText style={styles.eventMeta}>
                    {selectedEvent.venueName} - {selectedEvent.price}
                  </ThemedText>
                </Pressable>
              </Link>
            ) : (
              <View style={styles.eventCard}>
                <ThemedText style={styles.eventTitle}>No events match these filters</ThemedText>
                <ThemedText style={styles.eventMeta}>Try clearing search or filter chips.</ThemedText>
              </View>
            )}
          </>
        ) : null}
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
    zIndex: 2,
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
    backgroundColor: '#E8FAFA',
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
    backgroundColor: Palette.raspberryRed,
  },
  eventCard: {
    gap: 5,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF1E8',
  },
  bottomSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 86,
    zIndex: 3,
    alignSelf: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: '#8C3A25',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  bottomSheetCollapsed: {
    minHeight: 76,
    paddingBottom: 12,
  },
  bottomSheetExpanded: {
    paddingBottom: 24,
  },
  sheetHandleArea: {
    gap: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#FFD0B8',
  },
  sheetHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sheetTitle: {
    color: Palette.ink,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  sheetMeta: {
    color: Palette.vintageBerry,
    fontSize: 12,
    fontWeight: '600',
  },
  collapsedEventText: {
    color: Palette.ink,
    fontSize: 13,
    fontWeight: '500',
  },
  eventCategory: {
    color: Palette.teal,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  eventTitle: {
    color: Palette.ink,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  eventMeta: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: Colors.light.background,
  },
});
