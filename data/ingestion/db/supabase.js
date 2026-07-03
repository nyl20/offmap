import { createClient } from '@supabase/supabase-js';

let _client = null;

// Server-side only — uses the service_role key, which bypasses RLS. Never
// expose this client or its key to a browser/mobile bundle.
export function getDb() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env variables are required');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}
