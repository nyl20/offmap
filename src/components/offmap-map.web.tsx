import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { mockEvents } from '@/data/mock-events';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useEventFilterStore } from '@/store/use-event-filter-store';
import type { EventCategory } from '@/types/event';

const initialEvent = mockEvents[0];
const quickFilters: { label: string; category?: EventCategory; freeOnly?: boolean }[] = [
  { label: 'Today' },
  { label: 'Free', freeOnly: true },
  { label: 'Art', category: 'art' },
  { label: 'Food', category: 'food' },
];

export function OffmapMap() {
  const [searchQuery, setSearchQuery] = useState('');
  const categories = useEventFilterStore((state) => state.categories);
  const setCategories = useEventFilterStore((state) => state.setCategories);
  const freeOnly = useEventFilterStore((state) => state.freeOnly);
  const setFreeOnly = useEventFilterStore((state) => state.setFreeOnly);
  const radiusMiles = useEventFilterStore((state) => state.radiusMiles);
  const filteredEvents = useMemo(() => {
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
  }, [categories, freeOnly, searchQuery]);
  const selectedEvent = filteredEvents[0] ?? initialEvent;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.overlay}>
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

      <View style={styles.mapPreview}>
        <View style={styles.gridLineVertical} />
        <View style={styles.gridLineHorizontal} />
        <View style={styles.marker}>
          <View style={styles.markerCore} />
        </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottomSheet}>
        <ThemedText type="smallBold">Nearby within {radiusMiles} miles</ThemedText>
        <Link href={`/event/${selectedEvent.id}`} asChild>
          <Pressable style={styles.eventCard}>
            <ThemedText type="smallBold">{selectedEvent.category.toUpperCase()}</ThemedText>
            <ThemedText type="subtitle">{selectedEvent.title}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {selectedEvent.venueName} - {selectedEvent.price}
            </ThemedText>
          </Pressable>
        </Link>
        <ThemedText type="small" themeColor="textSecondary">
          Native Mapbox renders in iOS/Android builds. Supabase:{' '}
          {isSupabaseConfigured ? 'configured' : 'add env vars in .env'}
        </ThemedText>
      </SafeAreaView>
    </View>
  );
}

function toggleCategory(categories: EventCategory[], category: EventCategory) {
  return categories.includes(category)
    ? categories.filter((selectedCategory) => selectedCategory !== category)
    : [...categories, category];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#DDE9E3',
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: 800,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    color: '#0F172A',
  },
  filterRow: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 800,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.light.background,
  },
  filterChipActive: {
    backgroundColor: '#E0F2FE',
  },
  mapPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLineVertical: {
    position: 'absolute',
    width: 18,
    height: '130%',
    transform: [{ rotate: '28deg' }],
    backgroundColor: '#C3D2CB',
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '130%',
    height: 18,
    transform: [{ rotate: '-18deg' }],
    backgroundColor: '#C3D2CB',
  },
  marker: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  markerCore: {
    width: 22,
    height: 22,
    borderWidth: 3,
    borderColor: '#ffffff',
    borderRadius: 11,
    backgroundColor: '#208AEF',
  },
  eventCard: {
    gap: 6,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  bottomSheet: {
    position: 'absolute',
    alignSelf: 'center',
    left: 16,
    right: 16,
    bottom: 72,
    maxWidth: 800,
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
});
