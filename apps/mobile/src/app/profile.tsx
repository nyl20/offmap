import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getProfile, type ProfileRow } from '@offmap/db';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    if (!user || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(null);
      return;
    }
    getProfile(supabase, user.id).then(setProfile).catch(() => setProfile(null));
  }, [user]);

  async function handleSignOut() {
    await supabase?.auth.signOut();
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.content} />
      </ThemedView>
    );
  }

  if (!user) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">Profile</ThemedText>
          <ThemedText themeColor="textSecondary">Sign in to save events and manage your account.</ThemedText>
          <Pressable style={styles.button} onPress={() => router.push('/sign-in')}>
            <ThemedText style={styles.buttonText}>Sign in</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="subtitle">{profile?.display_name ?? user.email ?? user.phone ?? 'Profile'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {user.email ?? user.phone ?? 'Signed in'}
        </ThemedText>
        <Pressable style={styles.button} onPress={handleSignOut}>
          <ThemedText style={styles.buttonText}>Sign out</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 12,
    padding: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: Palette.sunflowerGold,
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 46,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: Palette.deepNavy,
    fontSize: 14,
    fontWeight: '800',
  },
});
