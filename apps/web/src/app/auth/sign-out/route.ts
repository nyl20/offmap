import { NextResponse, type NextRequest } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';

// Sign-out has to happen server-side (not a bare client-side
// supabase.auth.signOut() call) so the Set-Cookie clearing headers actually
// reach the response — see server.ts's setAll.
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url));
}
