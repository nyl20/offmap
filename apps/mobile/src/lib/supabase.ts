import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(isHttpUrl(supabaseUrl) && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (__DEV__ && !isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured. Check EXPO_PUBLIC_SUPABASE_URL is an http(s) URL and EXPO_PUBLIC_SUPABASE_ANON_KEY is set.',
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
