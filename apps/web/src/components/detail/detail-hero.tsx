'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkSimpleIcon, CaretLeftIcon } from '@phosphor-icons/react/ssr';

import type { CategoryAccent } from '@offmap/shared';

import { isBookmarked, toggleBookmark } from '@/lib/bookmarks';
import styles from './detail-hero.module.css';

type DetailHeroProps = {
  imageUrl: string | null;
  accent: CategoryAccent;
  icon: React.ReactNode;
  kind: 'event' | 'venue';
  id: number;
};

export function DetailHero({ imageUrl, accent, icon, kind, id }: DetailHeroProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  // Some sources (Resident Advisor in particular) block hotlinking outright
  // — images.ra.co 403s any request without its own Referer — so a present
  // imageUrl is not a guarantee the <img> will actually load.
  const showImage = imageUrl && !imageFailed;

  useEffect(() => {
    // One-shot sync from localStorage on mount — SSR has no access to it, so
    // this can't be a lazy useState initializer without risking a hydration
    // mismatch between server ("false") and client (the real saved state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(isBookmarked(kind, id));
  }, [kind, id]);

  return (
    <div className={styles.hero}>
      {showImage ? (
        // Scraped image URLs span an unbounded set of source domains,
        // incompatible with next/image's remotePatterns allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <div className={styles.fallback} style={{ background: `var(--color-${accent}-soft)` }}>
          {icon}
        </div>
      )}
      <button
        type="button"
        className={`${styles.floatBtn} ${styles.back}`}
        aria-label="Back"
        onClick={() => router.back()}
      >
        <CaretLeftIcon weight="regular" size={17} />
      </button>
      <button
        type="button"
        className={`${styles.floatBtn} ${styles.save} ${saved ? styles.saved : ''}`}
        aria-label={saved ? 'Remove from saved' : 'Save'}
        aria-pressed={saved}
        onClick={() => setSaved(toggleBookmark(kind, id))}
      >
        <BookmarkSimpleIcon weight={saved ? 'fill' : 'regular'} size={15} />
      </button>
    </div>
  );
}
