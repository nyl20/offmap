'use client';

// Client-only "saved" list — no Supabase Auth is wired up yet, so this is a
// deliberate MVP scope limit rather than the real saved_events/profiles
// feature. Keyed by "event:<id>" / "venue:<id>" so both entity types share
// one list without id collisions.

const STORAGE_KEY = 'offmap.bookmarks';

type BookmarkKind = 'event' | 'venue';

function bookmarkId(kind: BookmarkKind, id: number | string): string {
  return `${kind}:${id}`;
}

function readAll(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeAll(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function isBookmarked(kind: BookmarkKind, id: number | string): boolean {
  return readAll().has(bookmarkId(kind, id));
}

export function toggleBookmark(kind: BookmarkKind, id: number | string): boolean {
  const ids = readAll();
  const key = bookmarkId(kind, id);
  const nowSaved = !ids.has(key);
  if (nowSaved) ids.add(key);
  else ids.delete(key);
  writeAll(ids);
  return nowSaved;
}

export function getBookmarkedIds(): { events: number[]; venues: number[] } {
  const events: number[] = [];
  const venues: number[] = [];
  for (const key of readAll()) {
    const [kind, id] = key.split(':');
    if (kind === 'event') events.push(Number(id));
    else if (kind === 'venue') venues.push(Number(id));
  }
  return { events, venues };
}
