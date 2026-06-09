import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mockEvents } from '@/data/mock-events';

export default function SavedScreen() {
  const savedEvent = mockEvents[0];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <ThemedText type="title">Saved</ThemedText>
        <ThemedText themeColor="textSecondary">
          Your upcoming saves, with profile and settings one tap away.
        </ThemedText>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        <Link href={`/event/${savedEvent.id}`} asChild>
          <Pressable style={styles.savedCard}>
            <ThemedText type="smallBold">{savedEvent.title}</ThemedText>
            <ThemedText themeColor="textSecondary">{savedEvent.venueName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Saved events will sync through Supabase auth and the saved_events table.
            </ThemedText>
          </Pressable>
        </Link>
      </ScrollView>
    </ThemedView>
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
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
});
