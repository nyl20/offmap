import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getServerSupabase } from '@/lib/supabase/server';

// auth.admin.deleteUser requires the service-role key, which must never
// reach a client bundle — this route is the only place that key is used.
// The caller is identified by their own session cookie (via
// getServerSupabase), not by a client-supplied id, so a signed-in user can
// only ever delete their own account.
export async function POST() {
  const userSupabase = await getServerSupabase();
  const { data } = await userSupabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }

  const adminSupabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Cascades to profiles/saved_events/saved_venues automatically — all
  // declared `on delete cascade` against auth.users in the migrations.
  const { error } = await adminSupabase.auth.admin.deleteUser(data.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await userSupabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
