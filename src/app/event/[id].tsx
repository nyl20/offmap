import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mockEvents } from '@/data/mock-events';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = mockEvents.find((item) => item.id === id) ?? mockEvents[0];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: event.title }} />
      <SafeAreaView style={styles.content}>
        <ThemedText type="subtitle">{event.title}</ThemedText>
        <ThemedText type="smallBold">{event.venueName}</ThemedText>
        <ThemedText themeColor="textSecondary">{event.address}</ThemedText>
        <ThemedText>{event.description}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Category: {event.category} - Price: {event.price ?? 'Unknown'}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 14,
    padding: 20,
  },
});
