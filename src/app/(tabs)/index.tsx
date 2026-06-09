import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mockEvents } from '@/data/mock-events';

const sections = ['Recommended for you', 'Today only', 'Popular nearby'];

export default function FeaturedScreen() {
  const featuredEvent = mockEvents[0];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <ThemedText type="title">Featured</ThemedText>
        <ThemedText themeColor="textSecondary">
          A curated feed for the best things happening around you.
        </ThemedText>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((section) => (
          <View key={section} style={styles.section}>
            <ThemedText type="smallBold">{section}</ThemedText>
            <Link href={`/event/${featuredEvent.id}`} asChild>
              <Pressable style={styles.featuredCard}>
                <ThemedText type="subtitle">{featuredEvent.title}</ThemedText>
                <ThemedText themeColor="textSecondary">
                  {featuredEvent.venueName} - {featuredEvent.price}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {featuredEvent.tags.join(' / ')}
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        ))}
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
    gap: 24,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  section: {
    gap: 10,
  },
  featuredCard: {
    gap: 8,
    minHeight: 140,
    justifyContent: 'flex-end',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E0F2FE',
  },
});
