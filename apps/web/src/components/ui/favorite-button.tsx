'use client';

import { useEffect, useState } from 'react';
import { HeartIcon } from '@phosphor-icons/react/ssr';

import { isBookmarked, toggleBookmark } from '@/lib/bookmarks';
import styles from './favorite-button.module.css';

const BURST_LINE_COUNT = 6;
const BURST_DURATION_MS = 500;

type FavoriteButtonProps = {
  kind: 'event' | 'venue';
  id: number;
  onChange?: (saved: boolean) => void;
};

export function FavoriteButton({ kind, id, onChange }: FavoriteButtonProps) {
  const [saved, setSaved] = useState(false);
  const [bursting, setBursting] = useState(false);

  useEffect(() => {
    // One-shot sync from localStorage on mount — SSR has no access to it, so
    // this can't be a lazy useState initializer without risking a hydration
    // mismatch between server ("false") and client (the real saved state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(isBookmarked(kind, id));
  }, [kind, id]);

  useEffect(() => {
    if (!bursting) return;
    const timer = window.setTimeout(() => setBursting(false), BURST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [bursting]);

  function handleClick(event: React.MouseEvent) {
    // The button floats over the card's <Link> — stop the click from also
    // triggering navigation to the event/venue detail page.
    event.preventDefault();
    event.stopPropagation();
    const nowSaved = toggleBookmark(kind, id);
    setSaved(nowSaved);
    onChange?.(nowSaved);
    if (nowSaved) setBursting(true);
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
