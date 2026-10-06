'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeartIcon } from '@phosphor-icons/react/ssr';

import { useAuth } from '@/lib/auth-context';
import { toggleSaved, useSavedIds } from '@/lib/saved';
import styles from './favorite-button.module.css';

const BURST_LINE_COUNT = 6;
const BURST_DURATION_MS = 500;

type FavoriteButtonProps = {
  kind: 'event' | 'venue';
  id: number;
  onChange?: (saved: boolean) => void;
};

export function FavoriteButton({ kind, id, onChange }: FavoriteButtonProps) {
  const router = useRouter();
  const { user } = useAuth();
  const savedIds = useSavedIds(user?.id ?? null);
  const saved = kind === 'event' ? savedIds.events.has(id) : savedIds.venues.has(id);
  const [bursting, setBursting] = useState(false);

  useEffect(() => {
    if (!bursting) return;
    const timer = window.setTimeout(() => setBursting(false), BURST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [bursting]);

  async function handleClick(event: React.MouseEvent) {
    // The button floats over the card's <Link> — stop the click from also
    // triggering navigation to the event/venue detail page.
    event.preventDefault();
    event.stopPropagation();

    if (!user) {
      router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    try {
      const nowSaved = await toggleSaved(kind, id, user.id);
      onChange?.(nowSaved);
      if (nowSaved) setBursting(true);
    } catch (err) {
      console.error('failed to toggle saved state', err);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.favorite} ${saved ? styles.saved : ''}`}
      aria-label={saved ? 'Remove from saved' : 'Save'}
      aria-pressed={saved}
      onClick={handleClick}
    >
      <HeartIcon weight={saved ? 'fill' : 'regular'} size={16} className={bursting ? styles.bounce : undefined} />
      {bursting ? (
        <span className={styles.burst} aria-hidden="true">
          {Array.from({ length: BURST_LINE_COUNT }).map((_, i) => (
            <span key={i} className={styles.burstLine} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </span>
      ) : null}
    </button>
  );
}
