import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Next 16 renamed the `middleware.ts` convention to `proxy.ts` (same
// mechanism, new name/export — see AGENTS.md's warning that Next 16 breaks
// training-data assumptions about this file). This is the one place a
// refreshed session gets written back to cookies on every request; without
// it, a signed-in user's access token would silently expire mid-session
// since Server Components can't write cookies themselves (see server.ts).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() (not getSession()) actually revalidates the JWT against
  // Supabase, which is what triggers the refresh this proxy exists to
  // persist. The user value itself isn't used here — pages/route handlers
  // read it themselves via server.ts's getServerSupabase().
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization — running auth refresh on
    // every CSS/JS/image request would be pure overhead with no auth state
    // to refresh.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
