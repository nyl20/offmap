'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPinIcon } from '@phosphor-icons/react/ssr';

import type { VenueRow } from '@offmap/db';
import { primaryCategory } from '@offmap/shared';

import { CategoryIcon } from '@/lib/icons';
import { FavoriteButton } from '@/components/ui/favorite-button';
import styles from '@/components/ui/media-card.module.css';

type PlaceCardProps = {
  venue: VenueRow;
  onFavoriteChange?: (saved: boolean) => void;
};

export function PlaceCard({ venue, onFavoriteChange }: PlaceCardProps) {
  const category = primaryCategory(venue.categories);
  const accent = category?.accent ?? 'lavender';
  const [imageFailed, setImageFailed] = useState(false);
  // Some sources block hotlinking outright (images.ra.co 403s without its
  // own Referer) — a present image_url is not a guarantee the <img> loads.
  const showImage = venue.image_url && !imageFailed;

  return (
    <div className={styles.card}>
      <Link href={`/venue/${venue.id}`} className={styles.cardLink}>
        <div className={styles.art}>
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={venue.image_url!} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <div className={styles.fallback} style={{ background: `var(--color-${accent}-soft)` }}>
              {category ? <CategoryIcon category={category.id} size={36} /> : <MapPinIcon weight="duotone" size={36} />}
            </div>
          )}
          <span className={styles.badge}>{category?.shortLabel ?? 'Spot'}</span>
        </div>
        <p className={styles.title}>{venue.name}</p>
        <span className={styles.meta}>{venue.neighborhood ?? venue.address}</span>
      </Link>
      <FavoriteButton kind="venue" id={venue.id} onChange={onFavoriteChange} />
    </div>
  );
}
