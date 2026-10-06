import { NextResponse, type NextRequest } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';

// Receives the ?code= redirect from signInWithOAuth (Google/Facebook) and
// from the phone/email confirmation links Supabase can send. Exchanging the
// code here (server-side) is what actually writes the session cookie —
// getServerSupabase()'s setAll can write cookies here because a Route
// Handler has a real response to attach Set-Cookie headers to, unlike a
// Server Component.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
