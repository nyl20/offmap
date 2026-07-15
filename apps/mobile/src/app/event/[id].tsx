import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { fetchEventById } from '@/data/events';
import { mockEvents } from '@/data/mock-events';
import type { OffmapEvent } from '@/types/event';

const photoAccents = [Palette.powderBlue, Palette.sunflowerGold, Palette.coral];

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mockEvent = mockEvents.find((item) => item.id === id);
  const { data: fetchedEvent, error, isLoading } = useQuery({
    enabled: Boolean(id && !mockEvent),
    queryKey: ['event', id],
    queryFn: () => fetchEventById(id),
  });
  const event = mockEvent ?? fetchedEvent ?? mockEvents[0];
  const eventDate = formatEventDate(event.startTime);
  const eventTime = `${formatEventTime(event.startTime)} - ${formatEventTime(event.endTime)}`;

  if (!mockEvent && isLoading) {
    return (
      <ThemedView style={[styles.container, styles.loadingState]}>
        <Stack.Screen options={{ title: 'Event' }} />
        <ThemedText style={styles.bodyText}>Loading event...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: event.title }} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']} style={styles.hero}>
          <View style={styles.heroImage}>
            <View style={styles.heroGlow} />
            <View style={styles.heroStage} />
            <View style={[styles.heroShape, styles.heroShapeOne]} />
            <View style={[styles.heroShape, styles.heroShapeTwo]} />
            <View style={[styles.heroShape, styles.heroShapeThree]} />
          </View>

          <View style={styles.heroCopy}>
            <ThemedText style={styles.categoryLabel}>{event.category}</ThemedText>
            <ThemedText style={styles.title}>{event.title}</ThemedText>
            <View style={styles.venueRow}>
              <SymbolView name={{ ios: 'map', web: 'map' }} size={16} tintColor={Palette.sunflowerGold} />
              <ThemedText numberOfLines={2} style={styles.venueText}>
                {event.venueName} - {event.address}
              </ThemedText>
            </View>
          </View>
        </SafeAreaView>

        <View style={styles.content}>
          <View style={styles.factsGrid}>
            <Fact icon={{ ios: 'calendar', web: 'calendar_month' }} label="Date" value={eventDate} />
            <Fact icon={{ ios: 'clock', web: 'schedule' }} label="Time" value={eventTime} />
            <Fact
              icon={{ ios: 'ticket', web: 'confirmation_number' }}
              label="Cost"
              value={event.price ?? 'Unknown'}
            />
            <Fact icon={{ ios: 'map', web: 'map' }} label="Location" value={event.venueName} />
          </View>

          <Section title="Overview">
            <ThemedText style={styles.bodyText}>{event.description}</ThemedText>
            <View style={styles.tagRow}>
              {event.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <ThemedText style={styles.tagText}>{tag}</ThemedText>
                </View>
              ))}
            </View>
          </Section>

          <Section title="How this got posted">
            <View style={styles.sharedNote}>
              <View style={styles.sharedAvatar}>
                <ThemedText style={styles.sharedAvatarText}>
                  {(event.sharedBy ?? event.sourceName ?? 'O').slice(0, 1)}
                </ThemedText>
              </View>
              <View style={styles.sharedCopy}>
                <ThemedText style={styles.sharedTitle}>
                  {event.sharedBy ?? event.sourceName ?? 'OFFMAP'} shared this
                </ThemedText>
                <ThemedText style={styles.sharedMeta}>
                  {event.sharedByHandle ?? event.categoryLabels?.join(', ') ?? '@offmap'} -{' '}
                  {event.heardAt ?? 'approved event source'}
                </ThemedText>
                <ThemedText style={styles.sharedBody}>
                  "{event.communityNote ?? event.description}"
                </ThemedText>
                <ThemedText style={styles.confirmedText}>
                  {error ? 'Could not refresh this event from Supabase.' : 'Reviewed for display on OFFMAP'}
                </ThemedText>
              </View>
            </View>
          </Section>

          <Section title="Photos">
            <ScrollView
              contentContainerStyle={styles.photoRail}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {photoAccents.map((accent, index) => (
                <PhotoCard accent={accent} event={event} index={index} key={accent} />
              ))}
            </ScrollView>
          </Section>

          <Section title="External Links">
            {event.sourceUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(event.sourceUrl!)}
                style={styles.externalLink}>
                <View style={styles.externalIcon}>
                  <SymbolView name={{ ios: 'safari', web: 'search' }} size={17} tintColor={Palette.paper} />
                </View>
                <View style={styles.externalCopy}>
                  <ThemedText style={styles.externalTitle}>Official website</ThemedText>
                  <ThemedText numberOfLines={1} style={styles.externalUrl}>
                    {event.sourceUrl}
                  </ThemedText>
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right', web: 'chevron_right' }}
                  size={15}
                  tintColor={Palette.sunflowerGold}
                />
              </Pressable>
            ) : (
              <ThemedText style={styles.bodyText}>No official link has been added yet.</ThemedText>
            )}
          </Section>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon:
    | { ios: 'calendar'; web: 'calendar_month' }
    | { ios: 'clock'; web: 'schedule' }
    | { ios: 'ticket'; web: 'confirmation_number' }
    | { ios: 'map'; web: 'map' };
  label: string;
  value: string;
}) {
  return (
    <View style={styles.factCard}>
      <View style={styles.factIcon}>
        <SymbolView name={icon} size={17} tintColor={Palette.paper} />
      </View>
      <ThemedText style={styles.factLabel}>{label}</ThemedText>
      <ThemedText numberOfLines={2} style={styles.factValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

function PhotoCard({
  accent,
  event,
  index,
}: {
  accent: string;
  event: OffmapEvent;
  index: number;
}) {
  return (
    <View style={[styles.photoCard, { backgroundColor: accent }]}>
      <View style={styles.photoShade} />
      <View style={styles.photoLight} />
      <View style={styles.photoTable} />
      <View style={[styles.photoDetail, { left: 22 + index * 10 }]} />
      <ThemedText style={styles.photoCaption}>
        {index === 0 ? event.venueName : index === 1 ? event.category : 'Event atmosphere'}
      </ThemedText>
    </View>
  );
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
    backgroundColor: Palette.deepNavy,
    flex: 1,
  },
  loadingState: {
    justifyContent: 'center',
    padding: 24,
  },
  hero: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heroImage: {
    height: 220,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: Palette.glassBlue,
  },
  heroGlow: {
    position: 'absolute',
    top: 26,
    right: 28,
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: Palette.sunflowerGold,
  },
  heroStage: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    backgroundColor: 'rgba(6, 26, 50, 0.48)',
  },
  heroShape: {
    position: 'absolute',
    borderRadius: 8,
  },
  heroShapeOne: {
    left: 30,
    bottom: 46,
    width: 84,
    height: 44,
    backgroundColor: Palette.sunflowerGold,
    transform: [{ rotate: '-10deg' }],
  },
  heroShapeTwo: {
    right: 52,
    bottom: 34,
    width: 64,
    height: 72,
    backgroundColor: Palette.powderBlue,
    transform: [{ rotate: '11deg' }],
  },
  heroShapeThree: {
    left: 126,
    top: 54,
    width: 44,
    height: 44,
    backgroundColor: Palette.coral,
  },
  heroCopy: {
    gap: 8,
  },
  categoryLabel: {
    color: Palette.sunflowerGold,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  title: {
    color: Palette.mintCream,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
  },
  venueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  venueText: {
    flex: 1,
    color: Palette.powderBlue,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  content: {
    gap: 26,
    padding: 20,
    paddingBottom: 120,
  },
  factsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  factCard: {
    width: '48%',
    minHeight: 116,
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Palette.glassStrong,
    borderColor: Palette.bone,
    borderWidth: 2,
  },
  factIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Palette.powderBlue,
  },
  factLabel: {
    color: Palette.sunflowerGold,
    fontSize: 12,
    fontWeight: '800',
  },
  factValue: {
    color: Palette.mintCream,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: Palette.mintCream,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  bodyText: {
    color: Palette.powderBlue,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Palette.glassBlue,
  },
  tagText: {
    color: Palette.paper,
    fontSize: 12,
    fontWeight: '800',
  },
  sharedNote: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Palette.glassStrong,
    borderColor: Palette.bone,
    borderWidth: 2,
  },
  sharedAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Palette.sunflowerGold,
  },
  sharedAvatarText: {
    color: Palette.deepNavy,
    fontSize: 15,
    fontWeight: '700',
  },
  sharedCopy: {
    flex: 1,
    gap: 4,
  },
  sharedTitle: {
    color: Palette.mintCream,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  sharedMeta: {
    color: Palette.powderBlue,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  sharedBody: {
    color: Palette.mintCream,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
  },
  confirmedText: {
    color: Palette.sunflowerGold,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  photoRail: {
    gap: 12,
    paddingRight: 20,
  },
  photoCard: {
    width: 210,
    height: 144,
    overflow: 'hidden',
    borderRadius: 10,
  },
  photoShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 58,
    backgroundColor: 'rgba(6, 26, 50, 0.42)',
  },
  photoLight: {
    position: 'absolute',
    top: 18,
    right: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(238, 244, 237, 0.38)',
  },
  photoTable: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 36,
    height: 22,
    borderRadius: 12,
    backgroundColor: 'rgba(238, 244, 237, 0.38)',
  },
  photoDetail: {
    position: 'absolute',
    bottom: 74,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(238, 244, 237, 0.48)',
  },
  photoCaption: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    color: Palette.mintCream,
    fontSize: 13,
    fontWeight: '700',
  },
  externalLink: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Palette.glassStrong,
    borderColor: Palette.bone,
    borderWidth: 2,
  },
  externalIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.powderBlue,
  },
  externalCopy: {
    flex: 1,
    gap: 2,
  },
  externalTitle: {
    color: Palette.mintCream,
    fontSize: 15,
    fontWeight: '800',
  },
  externalUrl: {
    color: Palette.powderBlue,
    fontSize: 12,
    fontWeight: '500',
  },
});
