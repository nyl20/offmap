import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

// offmap:// is already registered as this app's scheme in app.config.js.
const REDIRECT_URL = 'offmap://auth/callback';

// openAuthSessionAsync (ASWebAuthenticationSession on iOS, Custom Tabs +
// intent filter on Android) intercepts the offmap:// redirect itself and
// resolves this promise with the final URL — no separate deep-link
// listener is needed for the OAuth case specifically.
export async function signInWithOAuth(provider: 'google' | 'facebook'): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase is not configured' };

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { error: error?.message ?? 'Could not start sign-in' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
  if (result.type !== 'success') return { error: null }; // user backed out — not an error

  const code = new URL(result.url).searchParams.get('code');
  if (!code) return { error: 'Sign-in did not return a code' };

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  return { error: exchangeError?.message ?? null };
}
