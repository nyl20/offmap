'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Browser-side singleton Supabase client, for Client Components that need
// live interactivity (search-as-you-type, map viewport queries via
// nearby_events, and now auth state). Session is stored in cookies (not
// localStorage) via @supabase/ssr so the server client in server.ts can
// read the same session for SSR/route guards.
let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required — copy apps/web/.env.example to .env.local and fill them in.'
    );
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
