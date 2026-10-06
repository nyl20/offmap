import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Server-side Supabase client for use in Server Components, Route Handlers,
// and Server Actions. Session lives in cookies (via @supabase/ssr) rather
// than the anon-only, session-disabled client this used to be — reads are
// still RLS-scoped (public for venues/events, auth.uid()-scoped for
// profiles/saved_events/saved_venues), so no service-role access is used
// here. A fresh client per request is required — never cache/reuse this
// across requests, per @supabase/ssr's own docs.
export async function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required — copy apps/web/.env.example to .env.local and fill them in.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components can't set cookies (no response to attach
        // headers to) — Next throws if you try. That's fine here: proxy.ts
        // (running before this) already refreshes the session on every
        // request, so a Server Component only ever needs to *read* a
        // current session, never write one.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // no-op in a Server Component context
        }
      },
    },
  });
}
