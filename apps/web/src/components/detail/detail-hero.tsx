'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkSimpleIcon, CaretLeftIcon } from '@phosphor-icons/react/ssr';

import type { CategoryAccent } from '@offmap/shared';

import { useAuth } from '@/lib/auth-context';
import { toggleSaved, useSavedIds } from '@/lib/saved';
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
  const { user } = useAuth();
  const savedIds = useSavedIds(user?.id ?? null);
  const saved = kind === 'event' ? savedIds.events.has(id) : savedIds.venues.has(id);
  const [imageFailed, setImageFailed] = useState(false);
  // Some sources (Resident Advisor in particular) block hotlinking outright
  // — images.ra.co 403s any request without its own Referer — so a present
  // imageUrl is not a guarantee the <img> will actually load.
  const showImage = imageUrl && !imageFailed;

  async function handleSaveClick() {
    if (!user) {
      router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    try {
      await toggleSaved(kind, id, user.id);
    } catch (err) {
      console.error('failed to toggle saved state', err);
    }
  }

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
        onClick={handleSaveClick}
      >
        <BookmarkSimpleIcon weight={saved ? 'fill' : 'regular'} size={15} />
      </button>
    </div>
  );
}
