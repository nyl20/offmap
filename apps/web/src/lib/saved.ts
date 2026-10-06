'use client';

// Replaces the old bookmarks.ts (pure localStorage) with a real,
// per-user saved_events/saved_venues-backed store. A single module-level
// cache + useSyncExternalStore is used instead of re-fetching per
// <FavoriteButton> instance — there can be dozens of cards on a page, and
// each one needs to know synchronously whether it's saved.

import { useEffect, useSyncExternalStore } from 'react';
import {
  getSavedEventIds,
  getSavedVenueIds,
  saveEvent,
  saveVenue,
  unsaveEvent,
  unsaveVenue,
} from '@offmap/db';

import { getBrowserSupabase } from './supabase/client';

export type SavedKind = 'event' | 'venue';

type SavedState = {
  events: Set<number>;
  venues: Set<number>;
  loading: boolean;
};

const EMPTY_STATE: SavedState = { events: new Set(), venues: new Set(), loading: true };

let state: SavedState = EMPTY_STATE;
let loadedForUserId: string | null | undefined; // undefined = never loaded yet
const listeners = new Set<() => void>();

function setState(next: SavedState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function ensureLoaded(userId: string | null) {
  if (loadedForUserId === userId) return;
  loadedForUserId = userId;

  if (!userId) {
    setState({ events: new Set(), venues: new Set(), loading: false });
    return;
  }

  setState({ ...state, loading: true });
  const supabase = getBrowserSupabase();
  try {
    const [eventIds, venueIds] = await Promise.all([
      getSavedEventIds(supabase, userId),
      getSavedVenueIds(supabase, userId),
    ]);
    setState({ events: new Set(eventIds), venues: new Set(venueIds), loading: false });
  } catch (err) {
    console.error('failed to load saved ids', err);
    setState({ events: new Set(), venues: new Set(), loading: false });
  }
}

/** Triggers (re)loading the saved-id cache for the given user and subscribes to it. */
export function useSavedIds(userId: string | null): SavedState {
  useEffect(() => {
    ensureLoaded(userId);
  }, [userId]);

  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => state,
    () => EMPTY_STATE
  );
}

// Optimistic: flips the local cache immediately, reverts if the write fails.
export async function toggleSaved(kind: SavedKind, id: number, userId: string): Promise<boolean> {
  const set = kind === 'event' ? state.events : state.venues;
  const nowSaved = !set.has(id);

  const nextSet = new Set(set);
  if (nowSaved) nextSet.add(id);
  else nextSet.delete(id);
  setState(kind === 'event' ? { ...state, events: nextSet } : { ...state, venues: nextSet });

  try {
    const supabase = getBrowserSupabase();
    if (kind === 'event') {
      if (nowSaved) await saveEvent(supabase, userId, id);
      else await unsaveEvent(supabase, userId, id);
    } else {
      if (nowSaved) await saveVenue(supabase, userId, id);
      else await unsaveVenue(supabase, userId, id);
    }
    return nowSaved;
  } catch (err) {
    // revert on failure
    setState(kind === 'event' ? { ...state, events: set } : { ...state, venues: set });
    throw err;
  }
}
