import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSavedEventIds, unsaveEvent } from '@offmap/db';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { fetchEventsByIds } from '@/data/events';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { OffmapEvent } from '@/types/event';

export default function SavedScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['saved-events', user?.id],
    queryFn: async () => {
      if (!supabase || !user) return [];
      const ids = await getSavedEventIds(supabase, user.id);
      return fetchEventsByIds(ids);
    },
    enabled: Boolean(user),
  });

  async function handleRemove(eventId: string) {
    if (!supabase || !user) return;
    await unsaveEvent(supabase, user.id, Number(eventId));
    queryClient.setQueryData<OffmapEvent[]>(['saved-events', user.id], (prev) =>
      (prev ?? []).filter((event) => event.id !== eventId),
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <ThemedText type="title">Saved</ThemedText>
        <ThemedText themeColor="textSecondary">
          Your upcoming saves, with profile and settings one tap away.
        </ThemedText>
      </SafeAreaView>

      {!authLoading && !user ? (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText themeColor="textSecondary">Sign in to see events you&apos;ve saved.</ThemedText>
          <Pressable style={styles.signInButton} onPress={() => router.push('/sign-in')}>
            <ThemedText style={styles.signInButtonText}>Sign in</ThemedText>
          </Pressable>
        </ScrollView>
      ) : isLoading ? null : events.length === 0 ? (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText themeColor="textSecondary">Nothing saved yet — tap the heart on an event to save it here.</ThemedText>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {events.map((event) => (
            <SavedRow event={event} key={event.id} onRemove={() => handleRemove(event.id)} />
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

function SavedRow({ event, onRemove }: { event: OffmapEvent; onRemove: () => void }) {
  return (
    <Link href={`/event/${event.id}`} asChild>
      <Pressable style={styles.savedCard}>
        {event.imageUrl ? (
          <Image contentFit="cover" source={{ uri: event.imageUrl }} style={styles.savedThumb} />
        ) : (
          <View style={styles.savedThumb} />
        )}
        <View style={styles.savedCardBody}>
          <ThemedText type="smallBold">{event.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{event.venueName}</ThemedText>
        </View>
        <Pressable
          onPress={(pressEvent) => {
            pressEvent.stopPropagation();
            onRemove();
          }}
          style={styles.removeButton}>
          <ThemedText style={styles.removeButtonText}>Remove</ThemedText>
        </Pressable>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  content: {
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderColor: Palette.hotPink,
    borderWidth: 2,
    backgroundColor: Palette.paper,
  },
  savedThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Palette.glassStrong,
  },
  savedCardBody: {
    flex: 1,
    gap: 2,
  },
  signInButton: {
    alignItems: 'center',
    backgroundColor: Palette.sunflowerGold,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 46,
    marginTop: 8,
  },
  signInButtonText: {
    color: Palette.deepNavy,
    fontSize: 14,
    fontWeight: '800',
  },
  removeButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  removeButtonText: {
    color: Palette.coral,
    fontSize: 12,
    fontWeight: '700',
  },
});
