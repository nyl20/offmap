import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Palette } from '@/constants/theme';
import { mockEvents } from '@/data/mock-events';
import { useEventFilterStore } from '@/store/use-event-filter-store';
import type { EventCategory, OffmapEvent } from '@/types/event';

const initialEvent = mockEvents[0];
const categoryColorByName: Record<EventCategory, string> = {
  art: Palette.coolSteel,
  food: Palette.saddleBrown,
  market: Palette.forestMoss,
  museum: Palette.coolSteel,
  music: Palette.posterOrange,
  other: Palette.teal,
  popup: Palette.sunflowerGold,
};
const quickFilters: { label: string; category?: EventCategory; freeOnly?: boolean }[] = [
  { label: 'Today' },
  { label: 'Free', freeOnly: true },
  { label: 'Art', category: 'art' },
  { label: 'Food', category: 'food' },
];

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
        <View style={styles.gridLineDiagonal} />
        {filteredEvents.map((event) => {
          const selected = event.id === selectedEvent?.id;

          return (
            <Pressable
              accessibilityLabel={`Select ${event.title}`}
              key={event.id}
              onPress={() => {
                setSelectedEventId(event.id);
                setSheetExpanded(true);
              }}
              style={[styles.marker, getPreviewPointStyle(event), selected && styles.markerSelected]}>
              <View style={[styles.markerCore, { backgroundColor: categoryColorByName[event.category] }]} />
            </Pressable>
          );
        })}
      </View>

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
              <SymbolView name={{ ios: 'map', web: 'map' }} size={16} tintColor={Palette.posterOrange} />
              <ThemedText style={styles.sheetTitle}>Nearby events</ThemedText>
            </View>
            <SymbolView
              name={{
                ios: sheetExpanded ? 'chevron.down' : 'chevron.up',
                web: sheetExpanded ? 'expand_more' : 'expand_less',
              }}
              size={16}
              tintColor={Palette.hotPink}
            />
          </View>
          {selectedEvent ? <EventSheetSummary event={selectedEvent} expanded={sheetExpanded} /> : null}
        </Pressable>

        {sheetExpanded ? (
          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.sheetMetaRow}>
              <ThemedText style={styles.sheetMeta}>Within {radiusMiles} miles</ThemedText>
              <ThemedText style={styles.sheetMeta}>{filteredEvents.length} sample pins</ThemedText>
            </View>
            {selectedEvent ? (
              <EventSheetDetails event={selectedEvent} />
            ) : (
              <View style={styles.eventCard}>
                <ThemedText style={styles.eventTitle}>No events match these filters</ThemedText>
                <ThemedText style={styles.eventMeta}>Try clearing search or filter chips.</ThemedText>
              </View>
            )}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function EventSheetSummary({ event, expanded }: { event: OffmapEvent; expanded: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.placeBadge, { backgroundColor: categoryColorByName[event.category] }]}>
        <SymbolView name={{ ios: 'mappin', web: 'location_on' }} size={15} tintColor={Palette.paper} />
      </View>
      <View style={styles.summaryCopy}>
        <ThemedText numberOfLines={expanded ? 2 : 1} style={styles.summaryTitle}>
          {event.title}
        </ThemedText>
        <ThemedText numberOfLines={1} style={styles.collapsedEventText}>
          {event.venueName} - {event.price ?? 'Details pending'}
        </ThemedText>
      </View>
    </View>
  );
}

function EventSheetDetails({ event }: { event: OffmapEvent }) {
  return (
    <View style={styles.detailsStack}>
      <ThemedText style={styles.descriptionText}>{event.description}</ThemedText>

      <View style={styles.factList}>
        <SheetFact
          icon={{ ios: 'clock', web: 'schedule' }}
          label="Open"
          value={`${formatEventDate(event.startTime)} - ${formatEventTime(event.startTime)} - ${formatEventTime(
            event.endTime,
          )}`}
        />
        <SheetFact icon={{ ios: 'map', web: 'map' }} label="Place" value={`${event.venueName} - ${event.address}`} />
        <SheetFact icon={{ ios: 'ticket', web: 'confirmation_number' }} label="Cost" value={event.price ?? 'Unknown'} />
      </View>

      <View style={styles.tagRow}>
        {event.tags.map((tag) => (
          <View key={tag} style={styles.tagChip}>
            <ThemedText style={styles.tagText}>{tag}</ThemedText>
          </View>
        ))}
      </View>

      {event.communityNote ? (
        <View style={styles.communityNote}>
          <ThemedText style={styles.communityTitle}>
            {event.sharedBy ?? 'Someone local'} shared this
          </ThemedText>
          <ThemedText style={styles.communityBody}>{event.communityNote}</ThemedText>
          <ThemedText style={styles.communityMeta}>
            {event.confirmations ?? 1} locals confirmed - {event.heardAt ?? 'community tip'}
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        {event.sourceUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(event.sourceUrl!)}
            style={styles.primaryAction}>
            <SymbolView name={{ ios: 'safari', web: 'open_in_new' }} size={16} tintColor={Palette.paper} />
            <ThemedText style={styles.primaryActionText}>Website</ThemedText>
          </Pressable>
        ) : null}
        <Link href={`/event/${event.id}`} asChild>
          <Pressable style={styles.secondaryAction}>
            <ThemedText style={styles.secondaryActionText}>More details</ThemedText>
            <SymbolView name={{ ios: 'chevron.right', web: 'chevron_right' }} size={15} tintColor={Palette.ink} />
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function SheetFact({
  icon,
  label,
  value,
}: {
  icon:
    | { ios: 'clock'; web: 'schedule' }
    | { ios: 'map'; web: 'map' }
    | { ios: 'ticket'; web: 'confirmation_number' };
  label: string;
  value: string;
}) {
  return (
    <View style={styles.factRow}>
      <View style={styles.factIcon}>
        <SymbolView name={icon} size={15} tintColor={Palette.paper} />
      </View>
      <View style={styles.factCopy}>
        <ThemedText style={styles.factLabel}>{label}</ThemedText>
        <ThemedText style={styles.factValue}>{value}</ThemedText>
      </View>
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

function getPreviewPointStyle(event: OffmapEvent): ViewStyle {
  const minLat = Math.min(...mockEvents.map((item) => item.latitude));
  const maxLat = Math.max(...mockEvents.map((item) => item.latitude));
  const minLong = Math.min(...mockEvents.map((item) => item.longitude));
  const maxLong = Math.max(...mockEvents.map((item) => item.longitude));
  const x = ((event.longitude - minLong) / (maxLong - minLong || 1)) * 58 + 21;
  const y = (1 - (event.latitude - minLat) / (maxLat - minLat || 1)) * 50 + 22;

  return {
    left: `${x}%`,
    top: `${y}%`,
  };
}

function toggleCategory(categories: EventCategory[], category: EventCategory) {
  return categories.includes(category)
    ? categories.filter((selectedCategory) => selectedCategory !== category)
    : [...categories, category];
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#E8ECE5',
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
    backgroundColor: Palette.posterOrange,
  },
  mapPreview: {
    flex: 1,
    overflow: 'hidden',
  },
  gridLineVertical: {
    position: 'absolute',
    left: '46%',
    width: 22,
    height: '130%',
    transform: [{ rotate: '24deg' }],
    backgroundColor: '#C9D6C0',
  },
  gridLineHorizontal: {
    position: 'absolute',
    top: '42%',
    width: '130%',
    height: 22,
    transform: [{ rotate: '-13deg' }],
    backgroundColor: '#D5C4AF',
  },
  gridLineDiagonal: {
    position: 'absolute',
    top: '18%',
    left: '-10%',
    width: '130%',
    height: 16,
    transform: [{ rotate: '32deg' }],
    backgroundColor: '#BFD0D6',
  },
  marker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    backgroundColor: Palette.paper,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  markerSelected: {
    width: 38,
    height: 38,
    marginLeft: -19,
    marginTop: -19,
    borderRadius: 19,
  },
  markerCore: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: Palette.paper,
    borderRadius: 7,
  },
  eventCard: {
    gap: 5,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#FFF0E6',
  },
  bottomSheet: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    bottom: 0,
    maxWidth: 900,
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.98)',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
  },
  bottomSheetCollapsed: {
    minHeight: 132,
    paddingBottom: 14,
  },
  bottomSheetExpanded: {
    height: '74%',
    paddingBottom: 18,
  },
  sheetHandleArea: {
    gap: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: Palette.posterOrange,
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
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  sheetMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetContent: {
    gap: 14,
    paddingBottom: 18,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  placeBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  summaryCopy: {
    flex: 1,
    gap: 2,
  },
  summaryTitle: {
    color: Palette.ink,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  collapsedEventText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
    fontWeight: '500',
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
  detailsStack: {
    gap: 14,
  },
  descriptionText: {
    color: Palette.ink,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  factList: {
    gap: 10,
  },
  factRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  factIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.ink,
  },
  factCopy: {
    flex: 1,
    gap: 2,
  },
  factLabel: {
    color: Colors.light.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  factValue: {
    color: Palette.ink,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.light.background,
  },
  tagText: {
    color: Palette.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  communityNote: {
    gap: 5,
    padding: 14,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
  },
  communityTitle: {
    color: Palette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  communityBody: {
    color: Palette.ink,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  communityMeta: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: Palette.ink,
  },
  primaryActionText: {
    color: Palette.paper,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: Colors.light.background,
  },
  secondaryActionText: {
    color: Palette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
});
