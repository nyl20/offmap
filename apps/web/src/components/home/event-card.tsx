'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPinIcon } from '@phosphor-icons/react/ssr';

import { formatEventDateTime } from '@offmap/shared';
import type { OffmapEvent } from '@offmap/shared';

import { CategoryIcon } from '@/lib/icons';
import { FavoriteButton } from '@/components/ui/favorite-button';
import styles from '@/components/ui/media-card.module.css';

type EventCardProps = {
  event: OffmapEvent;
  onFavoriteChange?: (saved: boolean) => void;
};

export function EventCard({ event, onFavoriteChange }: EventCardProps) {
  const accent = event.category?.accent ?? 'mint';
  const [imageFailed, setImageFailed] = useState(false);
  // Some sources (Resident Advisor in particular) block hotlinking outright
  // — images.ra.co 403s any request without its own Referer — so a present
  // image_url is not a guarantee the <img> will actually load. Falls back to
  // the same icon tile used when there's no image_url at all.
  const showImage = event.imageUrl && !imageFailed;

  return (
    <div className={styles.card}>
      <Link href={`/event/${event.id}`} className={styles.cardLink}>
        <div className={styles.art}>
          {showImage ? (
            // Scraped image URLs span an unbounded set of source domains,
            // incompatible with next/image's remotePatterns allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.imageUrl!} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <div className={styles.fallback} style={{ background: `var(--color-${accent}-soft)` }}>
              {event.category ? <CategoryIcon category={event.category.id} size={36} /> : <MapPinIcon weight="duotone" size={36} />}
            </div>
          )}
          {!showImage && event.category ? <span className={styles.badge}>{event.category.shortLabel}</span> : null}
        </div>
        <p className={styles.title}>{event.title}</p>
        <span className={styles.meta}>
          {formatEventDateTime(event.startTime, event.endTime)} · {event.venue.name}
        </span>
      </Link>
      <FavoriteButton kind="event" id={event.id} onChange={onFavoriteChange} />
    </div>
  );
}
