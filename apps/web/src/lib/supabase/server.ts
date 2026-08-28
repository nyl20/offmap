import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client for use in Server Components. Uses the anon
// key — RLS already scopes reads correctly (all of `venues`; `events` where
// `can_display = true`), so no elevated/service-role access is needed for
// reads, and this app performs no writes. A fresh client per call is fine
// here (Server Components run per-request, not a long-lived process).
export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required — copy apps/web/.env.example to .env.local and fill them in.'
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
