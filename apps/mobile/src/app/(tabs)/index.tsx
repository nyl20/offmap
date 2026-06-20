import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { mockEvents } from '@/data/mock-events';
import type { OffmapEvent } from '@/types/event';

const featuredEvents = mockEvents.slice(0, 2);
const todayEvents = mockEvents.slice(2, 4);
const recommendedEvents = mockEvents.slice(4);

const categoryColors: Record<OffmapEvent['category'], string> = {
  art: Palette.raspberryRed,
  food: Palette.vintageBerry,
  market: Palette.teal,
  museum: Palette.sunflowerGold,
  music: Palette.frostedBlue,
  other: Palette.teal,
  popup: Palette.raspberryRed,
};

export default function FeaturedScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <View style={styles.headerCopy}>
            <ThemedText style={styles.kicker}>OFFMAP</ThemedText>
            <ThemedText style={styles.title}>Community Board</ThemedText>
            <ThemedText style={styles.subtitle}>Flyers, tips, and tiny city rumors.</ThemedText>
          </View>
          <Pressable style={styles.sparkButton}>
            <SymbolView name={{ ios: 'plus', web: 'add' }} size={17} tintColor={Palette.paper} />
          </Pressable>
        </SafeAreaView>

        <View style={styles.featuredSection}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>New on the Board</ThemedText>
            <ThemedText style={styles.viewAll}>Pin one {'->'}</ThemedText>
          </View>
          <ScrollView
            contentContainerStyle={styles.featuredRail}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {featuredEvents.map((event, index) => (
              <FeaturedCard event={event} index={index} key={event.id} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.todaySection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.todayDot}>
                <ThemedText style={styles.todayDotText}>!</ThemedText>
              </View>
              <ThemedText style={styles.sectionTitle}>Today’s Notes</ThemedText>
            </View>
          </View>

          <View style={styles.todayStack}>
            {todayEvents.map((event, index) => (
              <TodayCard event={event} index={index} key={event.id} />
            ))}
          </View>
        </View>

        <View style={styles.recommendedSection}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Around Town</ThemedText>
            <Pressable style={styles.filterButton}>
              <FilterGlyph />
            </Pressable>
          </View>

          <View style={styles.recommendationGrid}>
            {recommendedEvents.map((event, index) => (
              <RecommendedCard event={event} index={index} key={event.id} />
            ))}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function FeaturedCard({ event, index }: { event: OffmapEvent; index: number }) {
  const accent = index % 2 === 0 ? Palette.sunflowerGold : Palette.frostedBlue;
  const cardStyle = StyleSheet.flatten([
    styles.featuredCard,
    index % 2 === 1 && styles.featuredCardAlt,
  ]);
  const sharedBy = event.sharedBy ?? 'A neighbor';

  return (
    <Link href={`/event/${event.id}`} asChild>
      <Pressable style={cardStyle}>
        <View style={[styles.paperPin, { backgroundColor: accent }]} />
        <View style={[styles.bannerRow, { backgroundColor: accent }]} />
        <View style={styles.featuredCardCopy}>
          <View style={styles.sharedByRow}>
            <View style={styles.avatar}>
              <ThemedText style={styles.avatarText}>{sharedBy.slice(0, 1)}</ThemedText>
            </View>
            <View style={styles.sharedByCopy}>
              <ThemedText style={styles.sharedByText}>Shared by {sharedBy}</ThemedText>
              <ThemedText style={styles.handleText}>{event.sharedByHandle}</ThemedText>
            </View>
          </View>
          <ThemedText numberOfLines={2} style={styles.featuredTitle}>
            {event.title}
          </ThemedText>
          <ThemedText numberOfLines={1} style={styles.featuredMeta}>
            {formatEventTime(event.startTime)} - {event.venueName}
          </ThemedText>
        </View>
      </Pressable>
    </Link>
  );
}

function TodayCard({ event, index }: { event: OffmapEvent; index: number }) {
  const accent = index % 2 === 0 ? Palette.sunflowerGold : Palette.frostedBlue;

  return (
    <Link href={`/event/${event.id}`} asChild>
      <Pressable style={styles.todayCard}>
        <View style={[styles.todayIconBox, { backgroundColor: `${accent}2B` }]}>
          <SymbolView
            name={{ ios: index === 0 ? 'star' : 'map', web: index === 0 ? 'star' : 'map' }}
            size={22}
            tintColor={categoryColors[event.category]}
          />
        </View>
        <View style={styles.todayCopy}>
          <ThemedText numberOfLines={1} style={styles.todaySource}>
            Shared by {event.sharedBy}
          </ThemedText>
          <ThemedText numberOfLines={2} style={styles.todayTitle}>
            {event.title}
          </ThemedText>
          <ThemedText numberOfLines={1} style={styles.todayMeta}>
            {formatEventTime(event.startTime)} - {event.venueName}
          </ThemedText>
        </View>
        <View style={styles.statusPill}>
          <ThemedText style={styles.statusText}>{index === 0 ? 'today' : 'now'}</ThemedText>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', web: 'chevron_right' }}
          size={15}
          tintColor={Palette.vintageBerry}
        />
      </Pressable>
    </Link>
  );
}

function RecommendedCard({ event, index }: { event: OffmapEvent; index: number }) {
  const accent = categoryColors[event.category];

  return (
    <Link href={`/event/${event.id}`} asChild>
      <Pressable style={styles.recommendationCard}>
        <View style={[styles.thumbnail, getThumbnailStyle(index)]}>
          <ThumbnailArt index={index} accent={accent} />
          <View style={styles.bookmark}>
            <SymbolView name={{ ios: 'bookmark', web: 'bookmark' }} size={13} tintColor={Palette.vintageBerry} />
          </View>
        </View>
        <ThemedText style={[styles.category, { color: accent }]}>
          Shared by {event.sharedBy}
        </ThemedText>
        <ThemedText numberOfLines={2} style={styles.cardTitle}>
          {event.title}
        </ThemedText>
        <ThemedText numberOfLines={1} style={styles.cardFooter}>
          {formatEventTime(event.startTime)} - {event.venueName}
        </ThemedText>
      </Pressable>
    </Link>
  );
}

function ThumbnailArt({ accent, index }: { accent: string; index: number }) {
  if (index === 0) {
    return (
      <>
        <View style={[styles.wallCircle, { backgroundColor: `${Palette.teal}33` }]} />
        <View style={styles.floorLine} />
        <View style={[styles.yogaMat, { backgroundColor: accent }]} />
        <View style={styles.plantStem} />
        <View style={styles.plantLeafOne} />
        <View style={styles.plantLeafTwo} />
      </>
    );
  }

  if (index === 1) {
    return (
      <>
        {Array.from({ length: 8 }).map((_, itemIndex) => (
          <View
            key={itemIndex}
            style={[
              styles.marketObject,
              {
                backgroundColor: itemIndex % 3 === 0 ? Palette.paper : Palette.sunflowerGold,
                left: 18 + (itemIndex % 4) * 30,
                top: 20 + Math.floor(itemIndex / 4) * 36,
              },
            ]}
          />
        ))}
        <View style={styles.marketTable} />
      </>
    );
  }

  if (index === 2) {
    return (
      <>
        <View style={styles.canvasFrame} />
        <View style={[styles.paintStroke, { backgroundColor: Palette.raspberryRed }]} />
        <View style={[styles.paintStrokeAlt, { backgroundColor: Palette.frostedBlue }]} />
        <View style={styles.galleryPlantOne} />
        <View style={styles.galleryPlantTwo} />
      </>
    );
  }

  return (
    <>
      <View style={styles.table} />
      {Array.from({ length: 5 }).map((_, itemIndex) => (
        <View
          key={itemIndex}
          style={[
            styles.supperLight,
            {
              backgroundColor: itemIndex % 2 === 0 ? Palette.sunflowerGold : Palette.paper,
              left: 18 + itemIndex * 24,
            },
          ]}
        />
      ))}
      <View style={[styles.supperPlate, { left: 24 }]} />
      <View style={[styles.supperPlate, { right: 26 }]} />
      <View style={[styles.supperPlateSmall, { backgroundColor: accent }]} />
    </>
  );
}

function FilterGlyph() {
  return (
    <View style={styles.filterGlyph}>
      <View style={[styles.filterGlyphLine, { width: 14 }]} />
      <View style={[styles.filterGlyphLine, { width: 9 }]} />
      <View style={[styles.filterGlyphLine, { width: 12 }]} />
    </View>
  );
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getThumbnailStyle(index: number) {
  if (index === 0) {
    return styles.thumbnailStudio;
  }
  if (index === 1) {
    return styles.thumbnailMarket;
  }
  if (index === 2) {
    return styles.thumbnailWorkshop;
  }
  return styles.thumbnailSupper;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 430,
    paddingBottom: 128,
    paddingTop: Platform.select({ web: 74, default: 0 }),
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  headerCopy: {
    gap: 2,
  },
  kicker: {
    color: Palette.teal,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: Palette.ink,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  subtitle: {
    color: '#8A5D50',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  sparkButton: {
    alignItems: 'center',
    backgroundColor: Palette.raspberryRed,
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    shadowColor: Palette.raspberryRed,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    width: 38,
  },
  featuredSection: {
    backgroundColor: Palette.cream,
    paddingBottom: 18,
  },
  todaySection: {
    backgroundColor: Palette.blush,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 12,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  recommendedSection: {
    backgroundColor: Palette.cream,
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 26,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  sectionTitle: {
    color: Palette.ink,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  viewAll: {
    color: Palette.teal,
    fontSize: 12,
    fontWeight: '600',
  },
  featuredRail: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  featuredCard: {
    backgroundColor: Palette.paper,
    borderColor: '#FFD0B8',
    borderRadius: 18,
    borderWidth: 1,
    height: 164,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    width: 284,
  },
  featuredCardAlt: {
    backgroundColor: '#F8FEFE',
  },
  paperPin: {
    borderRadius: 14,
    height: 28,
    position: 'absolute',
    right: 16,
    top: 16,
    width: 28,
  },
  bannerRow: {
    height: 8,
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  featuredCardCopy: {
    gap: 9,
  },
  sharedByRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: Palette.blush,
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  avatarText: {
    color: Palette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  sharedByCopy: {
    flex: 1,
    gap: 1,
  },
  sharedByText: {
    color: Palette.ink,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  handleText: {
    color: Palette.vintageBerry,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
  },
  featuredTitle: {
    color: Palette.ink,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  featuredMeta: {
    color: Palette.raspberryRed,
    fontSize: 12,
    fontWeight: '600',
  },
  todayDot: {
    alignItems: 'center',
    backgroundColor: Palette.raspberryRed,
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  todayDotText: {
    color: Palette.paper,
    fontSize: 12,
    fontWeight: '700',
  },
  todayStack: {
    gap: 12,
  },
  todayCard: {
    alignItems: 'center',
    backgroundColor: Palette.paper,
    borderColor: '#FFD0B8',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    padding: 12,
    shadowColor: '#8C3A25',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  todayIconBox: {
    alignItems: 'center',
    borderRadius: 14,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  todayCopy: {
    flex: 1,
    gap: 2,
  },
  todaySource: {
    color: Palette.raspberryRed,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  todayTitle: {
    color: Palette.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  todayMeta: {
    color: Palette.vintageBerry,
    fontSize: 12,
    fontWeight: '500',
  },
  statusPill: {
    backgroundColor: Palette.blush,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    color: Palette.raspberryRed,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: Palette.paper,
    borderColor: '#FFD0B8',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  filterGlyph: {
    alignItems: 'center',
    gap: 3,
  },
  filterGlyphLine: {
    height: 2,
    borderRadius: 999,
    backgroundColor: Palette.vintageBerry,
  },
  recommendationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 20,
  },
  recommendationCard: {
    gap: 5,
    width: '47.5%',
  },
  thumbnail: {
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  thumbnailStudio: {
    backgroundColor: Palette.blush,
  },
  thumbnailMarket: {
    backgroundColor: Palette.sunflowerGold,
  },
  thumbnailWorkshop: {
    backgroundColor: '#FFF0E6',
  },
  thumbnailSupper: {
    backgroundColor: Palette.raspberryRed,
  },
  bookmark: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  cardTitle: {
    color: Palette.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 17,
  },
  cardMeta: {
    color: Palette.vintageBerry,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  cardFooter: {
    color: Palette.raspberryRed,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  wallCircle: {
    borderRadius: 50,
    height: 100,
    left: 38,
    position: 'absolute',
    top: 18,
    width: 100,
  },
  floorLine: {
    backgroundColor: '#B98A55',
    height: 2,
    left: 10,
    position: 'absolute',
    right: 10,
    top: '64%',
  },
  yogaMat: {
    borderRadius: 999,
    bottom: 36,
    height: 7,
    left: 28,
    position: 'absolute',
    right: 28,
  },
  plantStem: {
    backgroundColor: Palette.ink,
    bottom: 42,
    height: 36,
    left: 27,
    position: 'absolute',
    transform: [{ rotate: '-12deg' }],
    width: 2,
  },
  plantLeafOne: {
    backgroundColor: Palette.teal,
    borderRadius: 9,
    bottom: 60,
    height: 20,
    left: 16,
    position: 'absolute',
    transform: [{ rotate: '-35deg' }],
    width: 10,
  },
  plantLeafTwo: {
    backgroundColor: Palette.teal,
    borderRadius: 9,
    bottom: 52,
    height: 20,
    left: 31,
    position: 'absolute',
    transform: [{ rotate: '35deg' }],
    width: 10,
  },
  marketObject: {
    borderRadius: 20,
    height: 22,
    position: 'absolute',
    width: 22,
  },
  marketTable: {
    backgroundColor: '#F3D5A4',
    bottom: 26,
    height: 42,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  canvasFrame: {
    backgroundColor: Palette.paper,
    borderColor: '#FFD99D',
    borderWidth: 3,
    height: 78,
    left: 26,
    position: 'absolute',
    top: 22,
    width: 92,
  },
  paintStroke: {
    borderRadius: 999,
    height: 16,
    left: 50,
    position: 'absolute',
    top: 54,
    transform: [{ rotate: '-22deg' }],
    width: 58,
  },
  paintStrokeAlt: {
    borderRadius: 999,
    height: 12,
    left: 42,
    position: 'absolute',
    top: 64,
    transform: [{ rotate: '-22deg' }],
    width: 50,
  },
  galleryPlantOne: {
    backgroundColor: Palette.teal,
    borderRadius: 12,
    bottom: 18,
    height: 34,
    left: 16,
    position: 'absolute',
    width: 12,
  },
  galleryPlantTwo: {
    backgroundColor: Palette.teal,
    borderRadius: 12,
    bottom: 18,
    height: 42,
    position: 'absolute',
    right: 18,
    width: 12,
  },
  table: {
    backgroundColor: '#6D3A2A',
    borderRadius: 18,
    bottom: 20,
    height: 60,
    left: 16,
    position: 'absolute',
    right: 16,
  },
  supperLight: {
    borderRadius: 10,
    height: 20,
    position: 'absolute',
    top: 18,
    width: 20,
  },
  supperPlate: {
    backgroundColor: Palette.paper,
    borderRadius: 18,
    bottom: 38,
    height: 36,
    position: 'absolute',
    width: 36,
  },
  supperPlateSmall: {
    borderRadius: 12,
    bottom: 48,
    height: 24,
    left: '43%',
    position: 'absolute',
    width: 24,
  },
});
