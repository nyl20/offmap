'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { getBrowserSupabase } from '@/lib/supabase/client';

type AuthState = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, loading: true });

// One onAuthStateChange subscription for the whole app (SiteHeader, sign-in
// UI, and any page that needs to know "is someone signed in") instead of
// each consumer re-subscribing independently.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const supabase = getBrowserSupabase();

    supabase.auth.getUser().then(({ data }) => {
      setState({ user: data.user, loading: false });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
