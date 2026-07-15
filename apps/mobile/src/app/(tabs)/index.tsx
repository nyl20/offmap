import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { fetchHomeEvents } from '@/data/events';
import { mockEvents } from '@/data/mock-events';
import type { EventCategory, OffmapEvent } from '@/types/event';

type StoryCategory = {
  accent: string;
  events: OffmapEvent[];
  label: string;
  mark: string;
};

type EventSection = {
  accent: string;
  categoryLabels: string[];
  events: OffmapEvent[];
  title: string;
};

const homeCategorySections: Omit<EventSection, 'events'>[] = [
  { title: 'Music', accent: Palette.powderBlue, categoryLabels: ['Music'] },
  { title: 'Crafts', accent: Palette.coolSteel, categoryLabels: ['Crafts', 'Art', 'Market'] },
  { title: 'Food & Drink', accent: Palette.coral, categoryLabels: ['Food', 'Drink'] },
  { title: 'Wellness', accent: Palette.sunflowerGold, categoryLabels: ['Wellness'] },
];

export default function FeaturedScreen() {
  const { data: fetchedEvents = [], error, isLoading } = useQuery({
    queryKey: ['home-events'],
    queryFn: fetchHomeEvents,
  });
  const [activeStory, setActiveStory] = useState<StoryCategory | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const homeEvents = fetchedEvents.length > 0 ? fetchedEvents : mockEvents;
  const usingFallbackEvents = fetchedEvents.length === 0;
  const eventSections = useMemo(() => buildHomeSections(homeEvents), [homeEvents]);
  const storyCategories = useMemo(() => buildStoryCategories(eventSections), [eventSections]);
  const sourceFeed = useMemo(() => homeEvents.filter((event) => event.imageUrl).slice(0, 4), [homeEvents]);
  const statusMessage = getHomeEventStatusMessage({
    error,
    isLoading,
    usingFallbackEvents,
  });

  const openStory = (category: StoryCategory) => {
    setActiveStory(category);
    setStoryIndex(0);
  };

  const closeStory = () => {
    setActiveStory(null);
    setStoryIndex(0);
  };

  const showNextStory = () => {
    if (!activeStory) {
      return;
    }
    const events = activeStory.events.length > 0 ? activeStory.events : mockEvents.slice(0, 3);
    if (storyIndex >= events.length - 1) {
      closeStory();
      return;
    }
    setStoryIndex((index) => index + 1);
  };

  const showPreviousStory = () => {
    setStoryIndex((index) => Math.max(index - 1, 0));
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <View style={styles.headerCopy}>
            <ThemedText style={styles.logo}>
              OFFMAP<ThemedText style={styles.logoDot}>.</ThemedText>
            </ThemedText>
            <ThemedText style={styles.location}>in New York City</ThemedText>
          </View>
          <View style={styles.headerActions}>
            <IconButton name={{ ios: 'bell', web: 'notifications' }} />
            <Link href="/suggest" asChild>
              <Pressable
                accessibilityLabel="Suggest an event"
                accessibilityRole="link"
                style={StyleSheet.flatten([styles.iconButton, styles.iconButtonFilled])}>
                <MapMarkerPlusIcon />
              </Pressable>
            </Link>
          </View>
        </SafeAreaView>

        <ScrollView
          contentContainerStyle={styles.storyRail}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {storyCategories.map((category) => (
            <StoryBubble category={category} key={category.label} onPress={() => openStory(category)} />
          ))}
        </ScrollView>

        <View style={styles.searchBar}>
          <SymbolView
            name={{ ios: 'magnifyingglass', web: 'search' }}
            size={18}
            tintColor={Palette.powderBlue}
          />
          <TextInput
            placeholder="Search events, places, vibes..."
            placeholderTextColor={Palette.powderBlue}
            style={styles.searchInput}
          />
        </View>

        {eventSections.map((section) => (
          <EventShelf key={section.title} section={section} />
        ))}

        {statusMessage ? (
          <ThemedText style={styles.statusText}>{statusMessage}</ThemedText>
        ) : null}

        {sourceFeed.length > 0 ? (
          <View style={styles.feedSection}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Image-ready events</ThemedText>
              <ThemedText style={styles.seeAll}>See all</ThemedText>
            </View>
            <View style={styles.feedStack}>
              {sourceFeed.map((event) => (
                <FeedPost event={event} key={event.id} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <StoryViewer
        category={activeStory}
        index={storyIndex}
        onClose={closeStory}
        onNext={showNextStory}
        onPrevious={showPreviousStory}
      />
    </ThemedView>
  );
}

function IconButton({
  name,
}: {
  name: { ios: 'bell'; web: 'notifications' };
}) {
  return (
    <Pressable style={styles.iconButton}>
      <SymbolView name={name} size={18} tintColor={Palette.paper} />
    </Pressable>
  );
}

function MapMarkerPlusIcon() {
  return (
    <View style={styles.markerIcon}>
      <View style={styles.markerPin}>
        <View style={styles.markerPinHole} />
      </View>
      <View style={styles.markerPlusVertical} />
      <View style={styles.markerPlusHorizontal} />
    </View>
  );
}

function StoryBubble({
  category,
  onPress,
}: {
  category: StoryCategory;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.storyItem}>
      <View style={[styles.storyRing, { borderColor: category.accent }]}>
        <View style={styles.storyInner}>
          <ThemedText style={styles.storyMark}>{category.mark}</ThemedText>
        </View>
      </View>
      <ThemedText numberOfLines={1} style={styles.storyLabel}>
        {category.label}
      </ThemedText>
    </Pressable>
  );
}

function StoryViewer({
  category,
  index,
  onClose,
  onNext,
  onPrevious,
}: {
  category: StoryCategory | null;
  index: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const events = category ? (category.events.length > 0 ? category.events : mockEvents.slice(0, 3)) : [];
  const event = events[index];

  return (
    <Modal animationType="fade" transparent visible={Boolean(category && event)} onRequestClose={onClose}>
      {category && event ? (
        <View style={styles.storyOverlay}>
          <SafeAreaView style={styles.storyViewer}>
            <View style={styles.storyProgressRow}>
              {events.map((item, itemIndex) => (
                <View
                  key={item.id}
                  style={[
                    styles.storyProgressTrack,
                    itemIndex <= index && styles.storyProgressTrackActive,
                  ]}
                />
              ))}
            </View>
            <View style={styles.storyViewerHeader}>
              <View style={[styles.storyMiniRing, { borderColor: category.accent }]}>
                <ThemedText style={styles.storyMiniMark}>{category.mark}</ThemedText>
              </View>
              <View style={styles.storyHeaderCopy}>
                <ThemedText style={styles.storyViewerLabel}>{category.label}</ThemedText>
                <ThemedText style={styles.storyViewerMeta}>{event.venueName}</ThemedText>
              </View>
              <Pressable onPress={onClose} style={styles.storyCloseButton}>
                <SymbolView name={{ ios: 'xmark', web: 'close' }} size={18} tintColor={Palette.paper} />
              </Pressable>
            </View>

            <View style={styles.storyPoster}>
              <PosterArt accent={category.accent} category={event.category} />
              <View style={styles.storyPosterScrim} />
              <View style={styles.storyPosterCopy}>
                <ThemedText style={styles.storyPosterTag}>{event.price ?? 'Details soon'}</ThemedText>
                <ThemedText style={styles.storyPosterTitle}>{event.title}</ThemedText>
                <ThemedText numberOfLines={2} style={styles.storyPosterBody}>
                  {event.description}
                </ThemedText>
                <Link href={`/event/${event.id}`} asChild>
                  <Pressable style={styles.storyDetailsButton}>
                    <ThemedText style={styles.storyDetailsButtonText}>View details</ThemedText>
                  </Pressable>
                </Link>
              </View>
            </View>

            <View style={styles.storyTapLayer}>
              <Pressable onPress={onPrevious} style={styles.storyTapZone} />
              <Pressable onPress={onNext} style={styles.storyTapZone} />
            </View>
          </SafeAreaView>
        </View>
      ) : null}
    </Modal>
  );
}

function EventShelf({ section }: { section: EventSection }) {
  const events = section.events;

  if (events.length === 0) {
    return null;
  }

  return (
    <View style={styles.shelf}>
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
        <ThemedText style={styles.seeAll}>See all</ThemedText>
      </View>
      <ScrollView
        contentContainerStyle={styles.eventRail}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {events.map((event) => (
          <EventTile accent={section.accent} event={event} key={event.id} />
        ))}
      </ScrollView>
    </View>
  );
}

function EventTile({
  accent,
  event,
}: {
  accent: string;
  event: OffmapEvent;
}) {
  return (
    <Link href={`/event/${event.id}`} asChild>
      <Pressable style={styles.eventTile}>
        <EventArtwork accent={accent} event={event} />
        <View style={styles.eventBadge}>
          <ThemedText numberOfLines={1} style={styles.eventBadgeText}>
            {event.price === 'Free' ? 'FREE' : event.sourceName ?? 'EVENT'}
          </ThemedText>
        </View>
        <View style={styles.heartButton}>
          <SymbolView name={{ ios: 'heart', web: 'favorite_border' }} size={15} tintColor={Palette.paper} />
        </View>
        <View style={styles.tileScrim} />
        <ThemedText numberOfLines={1} style={styles.tileTitle}>
          {event.title}
        </ThemedText>
        <View style={styles.tileMeta}>
          <ThemedText numberOfLines={1} style={styles.tileVenue}>
            {event.venueName}
          </ThemedText>
          <ThemedText numberOfLines={1} style={styles.tilePrice}>
            {event.price ?? 'Details soon'}
          </ThemedText>
        </View>
      </Pressable>
    </Link>
  );
}

function FeedPost({ event }: { event: OffmapEvent }) {
  return (
    <Link href={`/event/${event.id}`} asChild>
      <Pressable style={styles.feedPost}>
        <View style={styles.feedPostHeader}>
          <View style={styles.feedAvatar}>
            <ThemedText style={styles.feedAvatarText}>{(event.sourceName ?? 'O').slice(0, 1)}</ThemedText>
          </View>
          <View style={styles.feedAuthor}>
            <ThemedText style={styles.feedAuthorName}>{event.sourceName ?? 'OFFMAP source'}</ThemedText>
            <ThemedText style={styles.feedHandle}>{event.categoryLabels?.join(', ') || event.category}</ThemedText>
          </View>
        </View>
        <View style={styles.feedPoster}>
          <EventArtwork accent={Palette.sunflowerGold} event={event} />
          <View style={styles.feedPosterScrim} />
          <ThemedText numberOfLines={2} style={styles.feedPosterTitle}>
            {event.title}
          </ThemedText>
        </View>
      </Pressable>
    </Link>
  );
}

function EventArtwork({ accent, event }: { accent: string; event: OffmapEvent }) {
  if (event.imageUrl) {
    return (
      <Image
        accessibilityLabel={event.title}
        contentFit="cover"
        source={{ uri: event.imageUrl }}
        style={styles.eventImage}
      />
    );
  }

  return <PosterArt accent={accent} category={event.category} />;
}

function PosterArt({ accent, category }: { accent: string; category: EventCategory }) {
  return (
    <View style={[styles.posterArt, { backgroundColor: accent }]}>
      <View style={styles.posterCircle} />
      <View style={styles.posterStripeOne} />
      <View style={styles.posterStripeTwo} />
      <View style={[styles.posterBlock, getPosterBlockStyle(category)]} />
    </View>
  );
}

function buildHomeSections(events: OffmapEvent[]): EventSection[] {
  return homeCategorySections.map((section) => ({
    ...section,
    events: events
      .filter((event) => eventMatchesAnyCategory(event, section.categoryLabels))
      .sort(sortImageReadyFirst)
      .slice(0, 8),
  }));
}

function buildStoryCategories(sections: EventSection[]): StoryCategory[] {
  return [
    {
      label: 'For You',
      mark: '*',
      accent: Palette.sunflowerGold,
      events: sections.flatMap((section) => section.events).slice(0, 4),
    },
    ...sections.map((section) => ({
      label: section.title,
      mark: section.title.slice(0, 2),
      accent: section.accent,
      events: section.events.slice(0, 4),
    })),
  ];
}

function eventMatchesAnyCategory(event: OffmapEvent, labels: string[]) {
  const eventLabels = [...(event.categoryLabels ?? []), event.category].map((label) => label.toLowerCase());

  return labels.some((label) => eventLabels.some((eventLabel) => eventLabel.includes(label.toLowerCase())));
}

function sortImageReadyFirst(first: OffmapEvent, second: OffmapEvent) {
  if (Boolean(first.imageUrl) !== Boolean(second.imageUrl)) {
    return first.imageUrl ? -1 : 1;
  }

  return new Date(first.startTime).getTime() - new Date(second.startTime).getTime();
}

function getHomeEventStatusMessage({
  error,
  isLoading,
  usingFallbackEvents,
}: {
  error: Error | null;
  isLoading: boolean;
  usingFallbackEvents: boolean;
}) {
  if (isLoading) {
    return 'Loading approved events...';
  }
  if (error) {
    return 'Could not load Supabase events. Showing sample events for now.';
  }
  if (usingFallbackEvents) {
    return 'No approved image-ready events returned yet. Showing sample events.';
  }

  return null;
}

function getPosterBlockStyle(category: EventCategory) {
  if (category === 'music') {
    return styles.posterBlockMusic;
  }
  if (category === 'food' || category === 'market') {
    return styles.posterBlockFood;
  }
  if (category === 'art') {
    return styles.posterBlockArt;
  }
  return styles.posterBlockDefault;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.deepNavy,
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 112,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  headerCopy: {
    gap: 0,
  },
  logo: {
    color: Palette.paper,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  logoDot: {
    color: Palette.sunflowerGold,
  },
  location: {
    color: Palette.powderBlue,
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: Palette.glassStrong,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconButtonFilled: {
    backgroundColor: Palette.sunflowerGold,
  },
  markerIcon: {
    height: 23,
    position: 'relative',
    width: 24,
  },
  markerPin: {
    alignItems: 'center',
    borderColor: Palette.deepNavy,
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    justifyContent: 'center',
    left: 1,
    position: 'absolute',
    top: 0,
    transform: [{ rotate: '45deg' }],
    width: 18,
  },
  markerPinHole: {
    backgroundColor: Palette.deepNavy,
    borderRadius: 3,
    height: 5,
    width: 5,
  },
  markerPlusHorizontal: {
    backgroundColor: Palette.deepNavy,
    borderRadius: 1,
    height: 3,
    position: 'absolute',
    right: 0,
    top: 7,
    width: 10,
  },
  markerPlusVertical: {
    backgroundColor: Palette.paper,
    borderRadius: 1,
    height: 10,
    position: 'absolute',
    right: 3.5,
    top: 3.5,
    width: 3,
  },
  storyRail: {
    gap: 14,
    paddingHorizontal: 16,
  },
  storyItem: {
    alignItems: 'center',
    gap: 6,
    width: 62,
  },
  storyRing: {
    alignItems: 'center',
    borderRadius: 31,
    borderWidth: 2.5,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  storyInner: {
    alignItems: 'center',
    backgroundColor: Palette.paper,
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  storyMark: {
    color: Palette.deepNavy,
    fontSize: 13,
    fontWeight: '700',
  },
  storyLabel: {
    color: Palette.mintCream,
    fontSize: 12,
    fontWeight: '600',
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: Palette.glassStrong,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 9,
    height: 34,
    marginHorizontal: 16,
    paddingHorizontal: 14,
  },
  searchInput: {
    color: Palette.paper,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  shelf: {
    gap: 9,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: Palette.paper,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 23,
  },
  seeAll: {
    color: Palette.sunflowerGold,
    fontSize: 12,
    fontWeight: '700',
  },
  eventRail: {
    gap: 10,
    paddingHorizontal: 16,
  },
  eventTile: {
    borderRadius: 5,
    height: 156,
    overflow: 'hidden',
    width: 148,
  },
  eventImage: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  posterArt: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  posterCircle: {
    backgroundColor: 'rgba(238, 244, 237, 0.22)',
    borderRadius: 58,
    height: 116,
    position: 'absolute',
    right: -30,
    top: 18,
    width: 116,
  },
  posterStripeOne: {
    backgroundColor: 'rgba(6, 26, 50, 0.36)',
    height: 22,
    left: -16,
    position: 'absolute',
    right: -16,
    top: 48,
    transform: [{ rotate: '-12deg' }],
  },
  posterStripeTwo: {
    backgroundColor: 'rgba(238, 244, 237, 0.26)',
    height: 15,
    left: -24,
    position: 'absolute',
    right: -24,
    top: 86,
    transform: [{ rotate: '13deg' }],
  },
  posterBlock: {
    borderColor: Palette.paper,
    borderWidth: 2.5,
    position: 'absolute',
  },
  posterBlockDefault: {
    borderRadius: 24,
    bottom: 42,
    height: 50,
    left: 25,
    width: 50,
  },
  posterBlockMusic: {
    borderRadius: 5,
    bottom: 44,
    height: 56,
    left: 35,
    transform: [{ rotate: '-8deg' }],
    width: 36,
  },
  posterBlockFood: {
    borderRadius: 42,
    bottom: 42,
    height: 58,
    left: 25,
    width: 58,
  },
  posterBlockArt: {
    borderRadius: 8,
    bottom: 44,
    height: 48,
    left: 28,
    transform: [{ rotate: '12deg' }],
    width: 68,
  },
  eventBadge: {
    backgroundColor: Palette.shadowNavy,
    borderRadius: 999,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    top: 8,
  },
  eventBadgeText: {
    color: Palette.mintCream,
    fontSize: 10,
    fontWeight: '800',
  },
  heartButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(6, 26, 50, 0.45)',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
  },
  tileScrim: {
    backgroundColor: 'rgba(6, 26, 50, 0.6)',
    bottom: 0,
    height: 76,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  tileTitle: {
    bottom: 39,
    color: Palette.mintCream,
    fontSize: 14,
    fontWeight: '800',
    left: 10,
    lineHeight: 16,
    position: 'absolute',
    right: 10,
  },
  tileMeta: {
    bottom: 11,
    gap: 0,
    left: 10,
    position: 'absolute',
    right: 10,
  },
  tileVenue: {
    color: Palette.mintCream,
    fontSize: 11,
    fontWeight: '600',
  },
  tilePrice: {
    color: Palette.sunflowerGold,
    fontSize: 11,
    fontWeight: '800',
  },
  feedSection: {
    gap: 9,
  },
  statusText: {
    color: Palette.powderBlue,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingHorizontal: 16,
  },
  feedStack: {
    gap: 10,
    paddingHorizontal: 16,
  },
  feedPost: {
    backgroundColor: Palette.glassStrong,
    borderColor: Palette.bone,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 10,
  },
  feedPostHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  feedAvatar: {
    alignItems: 'center',
    backgroundColor: Palette.powderBlue,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  feedAvatarText: {
    color: Palette.deepNavy,
    fontSize: 13,
    fontWeight: '800',
  },
  feedAuthor: {
    flex: 1,
  },
  feedAuthorName: {
    color: Palette.mintCream,
    fontSize: 13,
    fontWeight: '700',
  },
  feedHandle: {
    color: Palette.powderBlue,
    fontSize: 11,
    fontWeight: '600',
  },
  feedPoster: {
    borderRadius: 8,
    height: 164,
    overflow: 'hidden',
  },
  feedPosterScrim: {
    backgroundColor: 'rgba(6, 26, 50, 0.52)',
    bottom: 0,
    height: 76,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  feedPosterTitle: {
    bottom: 14,
    color: Palette.mintCream,
    fontSize: 20,
    fontWeight: '800',
    left: 14,
    lineHeight: 23,
    position: 'absolute',
    right: 14,
  },
  textPost: {
    backgroundColor: Palette.glassBlue,
    borderRadius: 8,
    gap: 7,
    padding: 14,
  },
  textPostLabel: {
    color: Palette.sunflowerGold,
    fontSize: 11,
    fontWeight: '800',
  },
  textPostTitle: {
    color: Palette.mintCream,
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 22,
  },
  textPostBody: {
    color: Palette.powderBlue,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  storyOverlay: {
    backgroundColor: 'rgba(6, 26, 50, 0.96)',
    flex: 1,
  },
  storyViewer: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  storyProgressRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 10,
  },
  storyProgressTrack: {
    backgroundColor: 'rgba(238, 244, 237, 0.22)',
    borderRadius: 999,
    flex: 1,
    height: 3,
  },
  storyProgressTrackActive: {
    backgroundColor: Palette.paper,
  },
  storyViewerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  storyMiniRing: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  storyMiniMark: {
    color: Palette.mintCream,
    fontSize: 11,
    fontWeight: '800',
  },
  storyHeaderCopy: {
    flex: 1,
  },
  storyViewerLabel: {
    color: Palette.paper,
    fontSize: 13,
    fontWeight: '800',
  },
  storyViewerMeta: {
    color: Palette.powderBlue,
    fontSize: 12,
    fontWeight: '600',
  },
  storyCloseButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  storyPoster: {
    borderRadius: 12,
    flex: 1,
    overflow: 'hidden',
  },
  storyPosterScrim: {
    backgroundColor: 'rgba(6, 26, 50, 0.62)',
    bottom: 0,
    height: 230,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  storyPosterCopy: {
    bottom: 24,
    gap: 10,
    left: 20,
    position: 'absolute',
    right: 20,
  },
  storyPosterTag: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.sunflowerGold,
    borderRadius: 999,
    color: Palette.deepNavy,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  storyPosterTitle: {
    color: Palette.mintCream,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
  },
  storyPosterBody: {
    color: Palette.powderBlue,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  storyDetailsButton: {
    alignSelf: 'flex-start',
    backgroundColor: Palette.mintCream,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  storyDetailsButtonText: {
    color: Palette.deepNavy,
    fontSize: 13,
    fontWeight: '800',
  },
  storyTapLayer: {
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 96,
  },
  storyTapZone: {
    flex: 1,
  },
});
