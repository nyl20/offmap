'use client';

import { useRef, useState } from 'react';
import { ArrowsClockwiseIcon, ClockIcon, GlobeIcon, MapPinIcon, PhoneIcon, XIcon } from '@phosphor-icons/react/ssr';

import type { VenueRow } from '@offmap/db';
import { formatVenueHours, getCurrentWeekdayLabel, primaryCategory } from '@offmap/shared';

import { CategoryIcon } from '@/lib/icons';
import { Pill } from '@/components/ui/pill';
import styles from './point-preview-card.module.css';

const DESCRIPTION_LIMIT = 160;

type PointPreviewCardProps = {
  venue: VenueRow;
  onDismiss: () => void;
  onOpen: (originRect: DOMRect) => void;
};

export function PointPreviewCard({ venue, onDismiss, onOpen }: PointPreviewCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const category = primaryCategory(venue.categories);
  const accent = category?.accent ?? 'lavender';
  const showImage = venue.image_url && !imageFailed;
  const hours = formatVenueHours(venue.venue_opening_hours);
  const subtitle = `${venue.neighborhood ?? venue.address} · ${getCurrentWeekdayLabel()} · ${hours ?? 'Hours not listed'}`;
  const description = venue.description
    ? venue.description.length > DESCRIPTION_LIMIT
      ? `${venue.description.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`
      : venue.description
    : null;

  function handleOpen() {
    if (!bodyRef.current) return;
    onOpen(bodyRef.current.getBoundingClientRect());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  }

  return (
    <div className={`${styles.cardOuter} ${flipped ? styles.flipped : ''}`}>
      <button type="button" className={`${styles.iconBtn} ${styles.close}`} aria-label="Close" onClick={onDismiss}>
        <XIcon weight="bold" size={13} />
      </button>
      <button
        type="button"
        className={`${styles.iconBtn} ${styles.flip}`}
        aria-label={flipped ? 'Show summary' : 'Show more details'}
        onClick={() => setFlipped((f) => !f)}
      >
        <ArrowsClockwiseIcon weight="bold" size={13} />
      </button>

      <div className={styles.cardInner}>
        <div
          ref={bodyRef}
          className={styles.face}
          onClick={handleOpen}
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div className={styles.art}>
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={venue.image_url!} alt="" onError={() => setImageFailed(true)} />
            ) : (
              <div className={styles.fallback} style={{ background: `var(--color-${accent}-soft)` }}>
                {category ? <CategoryIcon category={category.id} size={30} /> : <MapPinIcon weight="duotone" size={30} />}
              </div>
            )}
            {category ? <span className={styles.badge}>{category.shortLabel}</span> : null}
          </div>
          <p className={styles.title}>{venue.name}</p>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>

        <div
          className={`${styles.face} ${styles.back}`}
          onClick={handleOpen}
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <p className={styles.backTitle}>{venue.name}</p>
          {description ? <p className={styles.description}>{description}</p> : null}
          <div className={styles.factRow}>
            <ClockIcon weight="regular" size={14} />
            <span>{hours ?? 'Hours not listed'}</span>
          </div>
          {venue.website_url ? (
            <div className={styles.factRow}>
              <GlobeIcon weight="regular" size={14} />
              <span className={styles.truncate}>{venue.website_url}</span>
            </div>
          ) : null}
          {venue.phone ? (
            <div className={styles.factRow}>
              <PhoneIcon weight="regular" size={14} />
              <span>{venue.phone}</span>
            </div>
          ) : null}
          <div className={styles.chips}>
            {venue.categories.slice(0, 3).map((catId) => {
              const meta = primaryCategory([catId]);
              return meta ? (
                <Pill key={catId} accent={meta.accent}>
                  {meta.shortLabel}
                </Pill>
              ) : null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
