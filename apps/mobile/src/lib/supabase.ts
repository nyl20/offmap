import 'react-native-url-polyfill/auto';

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = normalizeEnvValue(Constants.expoConfig?.extra?.supabaseUrl);
const supabaseAnonKey = normalizeEnvValue(Constants.expoConfig?.extra?.supabaseAnonKey);

export const isSupabaseConfigured = Boolean(isHttpUrl(supabaseUrl) && supabaseAnonKey);

// Refresh tokens are long-lived bearer credentials — SecureStore (Keychain
// on iOS, Keystore-backed EncryptedSharedPreferences on Android) is the
// appropriate place for them, not AsyncStorage's plain-text storage.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: SecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        // RN has no URL bar for Supabase to parse a session out of — the
        // OAuth code exchange is handled manually via the deep-link
        // listener in app/_layout.tsx instead.
        detectSessionInUrl: false,
        // The default is 'implicit' (tokens in a URL fragment) — PKCE is
        // required for the manual exchangeCodeForSession() flow below,
        // and is the more secure choice generally (the code verifier never
        // appears in a URL, unlike the implicit flow's tokens).
        flowType: 'pkce',
      },
    })
  : null;

if (__DEV__ && !isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured. Check SUPABASE_URL is an http(s) URL and SUPABASE_ANON_KEY is set in apps/mobile/.env.',
  );
}

function normalizeEnvValue(value?: string) {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
