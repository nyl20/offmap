'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser-side singleton Supabase client, for Client Components that need
// live interactivity (search-as-you-type, map viewport queries via
// nearby_events). Same anon key / RLS scope as the server client.
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

  browserClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return browserClient;
}
