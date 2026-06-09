import { Link } from 'expo-router';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mockEvents } from '@/data/mock-events';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useEventFilterStore } from '@/store/use-event-filter-store';

const quickFilters = ['Today', 'Free', 'Art', 'Food'];

export default function DiscoverScreen() {
  const radiusMiles = useEventFilterStore((state) => state.radiusMiles);
  const featuredEvent = mockEvents[0];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.mapPlaceholder}>
        <ThemedText type="subtitle">Discover Map</ThemedText>
        <ThemedText style={styles.centerText} themeColor="textSecondary">
          Mapbox will render events here after the development build is configured.
        </ThemedText>
      </View>

      <SafeAreaView edges={['top']} style={styles.overlay}>
        <TextInput
          placeholder="Search events, venues, neighborhoods"
          placeholderTextColor="#64748B"
          style={styles.searchInput}
        />
        <View style={styles.filterRow}>
          {quickFilters.map((filter) => (
            <Pressable key={filter} style={styles.filterChip}>
              <ThemedText type="small">{filter}</ThemedText>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottomSheet}>
        <ThemedText type="smallBold">Nearby within {radiusMiles} miles</ThemedText>
        <Link href={`/event/${featuredEvent.id}`} asChild>
          <Pressable style={styles.eventCard}>
            <ThemedText type="smallBold">{featuredEvent.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {featuredEvent.venueName} - {featuredEvent.price}
            </ThemedText>
          </Pressable>
        </Link>
        <ThemedText type="small" themeColor="textSecondary">
          Supabase: {isSupabaseConfigured ? 'configured' : 'add env vars in .env'}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#ECFEFF',
  },
  centerText: {
    maxWidth: 320,
    textAlign: 'center',
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
    backgroundColor: 'rgba(255,255,255,0.96)',
    color: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
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
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  bottomSheet: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  eventCard: {
    gap: 4,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
});
